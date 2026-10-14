#!/usr/bin/env python3
"""List stored schedules from devices in app/ips.json using read-only requests."""

import argparse
import concurrent.futures
import getpass
import hashlib
import ipaddress
import json
import re
import secrets
import ssl
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path


DEFAULT_CACHE = Path(__file__).resolve().parents[1] / "ips.json"
DEVICE_ID = re.compile(r"^[0-9a-f]{6,12}$", re.IGNORECASE)


def digest_authorization(challenge, request, username, password):
    if not challenge.lower().startswith("digest "):
        return None
    values = urllib.request.parse_keqv_list(
        urllib.request.parse_http_list(challenge[7:])
    )
    realm, nonce = values.get("realm"), values.get("nonce")
    if not realm or not nonce:
        return None
    algorithm = values.get("algorithm", "MD5").upper()
    hashes = {"MD5": hashlib.md5, "SHA-256": hashlib.sha256}
    base_algorithm = algorithm.removesuffix("-SESS")
    hash_fn = hashes.get(base_algorithm)
    if not hash_fn:
        return None

    def digest(value):
        return hash_fn(value.encode()).hexdigest()

    uri = request.selector
    ha1 = digest(f"{username}:{realm}:{password}")
    cnonce = secrets.token_hex(8)
    if algorithm.endswith("-SESS"):
        ha1 = digest(f"{ha1}:{nonce}:{cnonce}")
    ha2 = digest(f"{request.get_method()}:{uri}")
    qops = values.get("qop", "auth").replace('"', "").split(",")
    qop = "auth" if "auth" in qops else None
    if qop:
        nc = "00000001"
        response = digest(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}")
    else:
        nc = None
        response = digest(f"{ha1}:{nonce}:{ha2}")

    fields = [
        f'username="{username}"', f'realm="{realm}"', f'nonce="{nonce}"',
        f'uri="{uri}"', f'response="{response}"', f"algorithm={algorithm}",
    ]
    if qop:
        fields.extend((f"qop={qop}", f"nc={nc}", f'cnonce="{cnonce}"'))
    if values.get("opaque"):
        fields.append(f'opaque="{values["opaque"]}"')
    return "Digest " + ", ".join(fields)


def open_request(request, timeout, username=None, password=None, insecure_tls=False):
    context = ssl._create_unverified_context() if insecure_tls else None
    try:
        if context:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                return json.load(response)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code != 401 or not username or password is None:
            raise
        challenge = error.headers.get("WWW-Authenticate", "")
        authorization = digest_authorization(challenge, request, username, password)
        if not authorization and challenge.lower().startswith("basic "):
            import base64
            authorization = "Basic " + base64.b64encode(
                f"{username}:{password}".encode()
            ).decode()
        if not authorization:
            raise
        retry = urllib.request.Request(
            request.full_url,
            data=request.data,
            headers={**request.headers, "Authorization": authorization},
            method=request.get_method(),
        )
        if context:
            with urllib.request.urlopen(retry, timeout=timeout, context=context) as response:
                return json.load(response)
        with urllib.request.urlopen(retry, timeout=timeout) as response:
            return json.load(response)


def request_json(ip, path, timeout, method="GET", body=None, username=None, password=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"http://{ip}{path}",
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method=method,
    )
    try:
        return open_request(request, timeout, username, password)
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, ssl.SSLError):
        # Newer devices may redirect HTTP to HTTPS with a device-local certificate.
        secure_request = urllib.request.Request(
            f"https://{ip}{path}", data=data, headers=dict(request.header_items()), method=method
        )
        return open_request(secure_request, timeout, username, password, insecure_tls=True)


def safe_value(value):
    """Hide credentials and query strings that may be embedded in schedule data."""
    if isinstance(value, dict):
        return {
            key: "[redacted]" if re.search(r"auth|token|secret|password|credential|key", key, re.I)
            else safe_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [safe_value(item) for item in value]
    if isinstance(value, str) and value.lower().startswith(("http://", "https://")):
        return value.split("?", 1)[0].split("#", 1)[0]
    return value


def omit_shelly_update_jobs(jobs):
    filtered = []
    for job in jobs:
        if not isinstance(job, dict) or not isinstance(job.get("calls"), list):
            filtered.append(job)
            continue
        calls = [
            call for call in job["calls"]
            if not isinstance(call, dict) or call.get("method") != "Shelly.Update"
        ]
        if calls:
            filtered.append({**job, "calls": calls})
    return filtered


def find_gen1_schedules(value, path="settings"):
    found = []
    if isinstance(value, dict):
        if "schedule" in value or "schedule_rules" in value:
            found.append((path, {
                key: safe_value(value[key])
                for key in ("schedule", "schedule_rules")
                if key in value
            }))
        for key, item in value.items():
            if key not in ("schedule", "schedule_rules"):
                found.extend(find_gen1_schedules(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(find_gen1_schedules(item, f"{path}[{index}]"))
    return found


def device_entries(cache_path):
    with cache_path.open(encoding="utf-8") as source:
        cache = json.load(source)
    devices = cache.get("devices", {})
    entries = devices.items() if isinstance(devices, dict) else (
        (entry.get("id", ""), entry) for entry in devices
    )

    grouped = defaultdict(lambda: {"ids": [], "names": set(), "types": set(), "gens": set(), "cache_errors": []})
    for cache_key, device in entries:
        if not isinstance(device, dict):
            continue
        raw_id = str(device.get("id") or cache_key or "")
        device_id = raw_id.split("_", 1)[0].lower()
        raw_ip = next((device.get(key) for key in ("ip", "local_ip", "lan_ip", "address") if device.get(key)), "")
        cache_errors = []
        if not DEVICE_ID.fullmatch(device_id):
            cache_errors.append(f"invalid device ID {raw_id!r}")
        ip = raw_ip
        try:
            ip = str(ipaddress.ip_address(ip))
        except ValueError:
            ip = ""
            cache_errors.append("missing or invalid IP")
        item = grouped[(ip, device_id)]
        if device_id not in item["ids"]:
            item["ids"].append(device_id)
        if device.get("name"):
            item["names"].add(str(device["name"]))
        if device.get("type"):
            item["types"].add(str(device["type"]))
        if device.get("gen") is not None:
            item["gens"].add(int(device["gen"]))
        item["cache_errors"].extend(cache_errors)
    return grouped


def identity_matches(device_id, identity):
    observed = re.sub(r"[^0-9a-f]", "", str(identity.get("mac", "")), flags=re.I).lower()
    if not observed:
        observed = re.sub(r"[^0-9a-f]", "", str(identity.get("id", "")), flags=re.I).lower()
    return bool(observed and (observed.endswith(device_id) or device_id.endswith(observed)))


def inspect_device(key, item, timeout, username=None, password=None):
    ip, device_id = key
    label = ", ".join(sorted(item["names"])) or "(unnamed)"
    model = ", ".join(sorted(item["types"])) or "unknown model"
    prefix = f"{device_id}  {label}  [{model}]  {ip}"
    if item["cache_errors"]:
        return prefix, "; ".join(sorted(set(item["cache_errors"]))), False

    try:
        identity = request_json(ip, "/shelly", timeout, username=username, password=password)
    except Exception as error:
        return prefix, f"UNREACHABLE: identity check failed: {error}", False
    if not identity_matches(device_id, identity):
        actual = identity.get("mac") or identity.get("id") or "identity unavailable"
        return prefix, f"IP MISMATCH: device reports {actual}; schedule not queried", False

    generation = identity.get("gen")
    if generation is None and item["gens"]:
        generation = max(item["gens"])
    try:
        if generation == 1:
            settings = request_json(ip, "/settings", timeout, username=username, password=password)
            schedules = find_gen1_schedules(settings)
            lines = []
            for path, details in schedules:
                rules = details.get("schedule_rules", [])
                if rules:
                    enabled = details.get("schedule", "unknown")
                    lines.append(f"{path}: enabled={enabled}, rules={json.dumps(rules, ensure_ascii=False)}")
            return prefix, "\n    ".join(lines), bool(lines)

        result = request_json(
            ip,
            "/rpc",
            timeout,
            method="POST",
            body={"id": 1, "method": "Schedule.List"},
            username=username,
            password=password,
        )
        if isinstance(result, dict) and isinstance(result.get("result"), dict):
            result = result["result"]
        jobs = result.get("jobs") if isinstance(result, dict) else None
        if not isinstance(jobs, list):
            if isinstance(result, dict) and result.get("error"):
                return prefix, f"Schedule.List unavailable: {result['error']}", False
            return prefix, "Schedule.List returned an unexpected response", False
        jobs = omit_shelly_update_jobs(jobs)
        if not jobs:
            return prefix, "", False
        lines = [
            json.dumps(safe_value(job), ensure_ascii=False, sort_keys=True)
            for job in jobs
        ]
        return prefix, "\n    ".join(lines), True
    except urllib.error.HTTPError as error:
        if error.code in (400, 404, 405):
            return prefix, f"SCHEDULE API UNSUPPORTED (HTTP {error.code})", False
        return prefix, f"REQUEST FAILED (HTTP {error.code})", False
    except Exception as error:
        return prefix, f"REQUEST FAILED: {error}", False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="device cache JSON (default: app/ips.json)")
    parser.add_argument("--timeout", type=float, default=3, help="per-request timeout in seconds (default: 3)")
    parser.add_argument("--workers", type=int, default=8, help="parallel devices (default: 8)")
    parser.add_argument("--username", help="local Shelly username; prompts for its password")
    parser.add_argument("--show-errors", action="store_true", help="also print devices with connection or API errors")
    args = parser.parse_args()

    password = getpass.getpass("Local Shelly password: ") if args.username else None
    devices = device_entries(args.cache)
    print(f"Checking {len(devices)} cached physical devices from {args.cache}; showing non-empty rules only.\n")
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        results = pool.map(
            lambda pair: inspect_device(pair[0], pair[1], args.timeout, args.username, password),
            devices.items(),
        )
        printed = 0
        for heading, result, has_rules in sorted(results, key=lambda row: row[0].lower()):
            if has_rules or args.show_errors and result:
                print(f"{heading}\n    {result}")
                printed += 1
        print(f"\n{printed} device(s) with non-empty stored rules.")


if __name__ == "__main__":
    main()
