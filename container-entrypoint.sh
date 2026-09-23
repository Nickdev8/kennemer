#!/usr/bin/env bash
set -Eeuo pipefail

key_path="${HTTPS_KEY_PATH:-}"
cert_path="${HTTPS_CERT_PATH:-}"
cert_marker="/certs/.kennemer-self-signed"
renew_before_seconds=$((30 * 24 * 60 * 60))

generate_self_signed_certificate() {
	local hostname="${HTTPS_CERT_HOSTNAME:-localhost}"
	local cert_dir
	cert_dir="$(dirname "$cert_path")"
	mkdir -p "$cert_dir"
	local key_tmp="${key_path}.tmp"
	local cert_tmp="${cert_path}.tmp"
	rm -f "$key_tmp" "$cert_tmp"
	openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
		-keyout "$key_tmp" -out "$cert_tmp" \
		-subj "/CN=${hostname}" \
		-addext "subjectAltName=DNS:${hostname},DNS:localhost,IP:127.0.0.1"
	mv "$key_tmp" "$key_path"
	mv "$cert_tmp" "$cert_path"
	touch "$cert_marker"
}

if [[ -n "$key_path" && -n "$cert_path" ]]; then
	if [[ -f "$cert_marker" ]]; then
		if [[ ! -s "$key_path" || ! -s "$cert_path" ]] || \
			! openssl x509 -checkend "$renew_before_seconds" -noout -in "$cert_path" >/dev/null 2>&1; then
			generate_self_signed_certificate
		fi
	elif [[ ! -e "$key_path" && ! -e "$cert_path" ]]; then
		generate_self_signed_certificate
	fi
fi

exec "$@"
