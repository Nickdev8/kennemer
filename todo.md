# Kennemer backlog

Updated: 12 October 2026. No Git/GitHub/CI work without explicit request.

## Done

- [x] Short typed configs, shared registry, automatic validation; controls sorted 1–9.
- [x] Isolated persistent `dev`, explicit `dev:live`; Docker stays live.
- [x] Dashboard components, shared polling/state logic, offline fallback and wake guard.
- [x] Home/Apparaten tabs; movable blue navigation above advanced controls.
- [x] Direct LAN control: Color spare 051026, `90706948e37c`, `10.10.80.169`.
- [x] Header numbers down columns: `1 4 7 / 2 5 8 / 3 6 9`; original locations retained.
- [x] Responsive inline editor: labels, colors, tabs, positions, timers, scene/status IDs, Ja/Nee.
- [x] PIN saves, import/export, reset/restore, migration, backups and conflict handling.
- [x] Debug popup: version/commit hashes, connection/device status; read-only remote checks.
- [x] Consistent button colors, Dutch copy and advanced-panel layout.
- [x] Four bell modes in advanced controls; local development shows a disabled preview.
- [x] Local checks/build, logic/browser tests and host diagnostics tests pass.

## Bell — commissioned, automatic roster paused

Confirmed Shelly Plus 1 relays; pulse duration **1 second**, both triggered together:

| Name         | Device ID      | IP             |
| ------------ | -------------- | -------------- |
| Bel school 1 | `a8032abc4264` | `10.10.80.162` |
| Bel school 2 | `08b61fd8993c` | `10.10.80.161` |

- [x] Import roster times from email; Monday–Friday; double signals use two
  one-second pulses with a one-second silent gap. The ten-minute profile rings
  every ten minutes 16:00–21:30 while active.
- [x] Four persistent choices: regular, short, ten-minute, and off; no holiday handling.
- [x] Build ODROID scheduler independent of browser/container; one active roster.
- [x] Durable schedules/event ledger, atomic edits, restart deduplication and outcome logs.
- [x] Amsterdam timezone, synchronized clock/DST handling; skip missed bells, no blind retries.
- [x] Concurrent identity-checked relay pulses with device-side `toggle_after: 1`.
- [x] Add Roosters beheren: times, exceptions, PIN save, pause/resume, import/export/restore.
- [x] Show next bell, service/clock health and both relay outcomes.
- [x] Live ODROID commissioning: single and double manual bells completed on both relays; service enabled and roster paused. Offline checks and installation docs in odroid/BELL.md.

Bell backend is installed and commissioned on the ODROID. Local dev and dev:live show a disabled bell preview. The automatic roster remains paused with the Off choice. Both relays now have startup off and 1-second auto-off. HTTP cannot guarantee
exactly-once or electrically simultaneous ringing.

## Later

- [x] Show “Apparaat offline” on individual device cards after two consecutive status failures, retaining the last known state and keeping the control usable.
- [ ] Shelly group control: confirm API/IDs.
- [Manualy checked and confirmed] Investigate old update CLI issue if still reproducible; preserve rollback.
- [Client no longer wants this] Footer/arrow navigation, RGB controls, hardware enrollment, longer restore history.
- [ ] Since we know all de devices and wattages. lets try to find a way to get all devices in a scene from ust the scene id. so we can report watages per card and of 0w the text is hidden.

## Checks / deployment

From `app/`: `validate:config`, `check`, `build`, `test`, `test:ui` via `npm run`.
Routine tests stay mocked. Bell scheduler is live on ODROID but its automatic roster remains paused.
Host diagnostics needs the updated `kennemer-maintenance-api.service` after deployment.




roster this i revieved via email. 
Delivered-To: nick.esselman@gmail.com
Received: by 2002:a98:8dc4:0:b0:27d:45ef:9235 with SMTP id k4csp6505608eih; Mon, 12 Oct 2026 06:50:29 -0700 (PDT)
X-Forwarded-Encrypted: i=4; AKwUvBwS6UcakTaUvq6sPbrX6zyWXWYp2jAOP8BOig10pqv07agf4K0gNusWxvjnFhxTqlK5uYo6SqStfUPio46v@gmail.com
X-Received: by 2002:a05:6000:3c8:b0:48b:108:48cf with SMTP id ffacd0b85a97d-48dbaae7046mr19317332f8f.25.1791813029023; Mon, 12 Oct 2026 06:50:29 -0700 (PDT)
ARC-Seal: i=3; a=rsa-sha256; t=1791813029; cv=pass; d=google.com; s=arc-20260327; b=mm3lkO+xwZzd90yVno8MaRHvSfAfGJpRkzxijni7bPjnrx4rxXwpjhZt38o+TgAHDf Dv0VdYklR2L4Qx8N7FbwuvZf1tGLfotvEUIKrbF4uHA/2qvLu1C5eb5rIn730gudueuI ZS0lLZejjpiuWzw8pKaFVXkJQ1b/SYsgza6dE59o6Im6mXglQhCkPObX2oU5KWe1BGuz EzoEWO8zvNg8fp2Si0g9fUj5713vM47dKsvfGHdcZSfSwRSiJbutSBQGbpdkAjOzdDKg wwoHEjCpJn+YNmELJb53kiOEc6oYdcUWdP5BzwHGBgi/irUbUiZI2qZOhr41QCq7nNkq NjHQ==
ARC-Message-Signature: i=3; a=rsa-sha256; c=relaxed/relaxed; d=google.com; s=arc-20260327; h=mime-version:content-language:accept-language:in-reply-to :references:message-id:date:thread-index:thread-topic:subject:to :from:dkim-signature:feedback-id:dkim-signature:dkim-signature; bh=DyX1xcMtlyktjD3GdSKqvUgdJ5QauObWDM6diNTfZTs=; fh=MXPs4y5HvXgOn98ScEhnIum+68Y9vZmI8hdo1vA0LJE=; b=U9wd58UEWR227Ft1PocLTepxLaqZOLNpGbpebehNKahlFm2MeWDLPZbPGdObGxIseX zM1cJZvvc9qm+OnMIjDPEKEhZoTqOGsiJRDPdSUfaaWairSx4f/WnHBeZPxymExmrd3a 9w4CeWH/oGQn9kuICcmIwz7QQU6zADB/vRkIp2LYcqHBDW7nXl7F8GfkH8QPjkESsA0g UKZkSyRMcyxKAfORRB1Ha3sV1I4cqEN4BJs/NjC3RoECGp0KZzzZ8yY2ZFb44eMNGoK3 EtZoor3ApeHFGeoI0GO7PZAp2hIJ1/QX6GqPEzD4Fe8KdZUbDWsZMj9eGy+FGaY/XIF/ gaQg==; dara=google.com
ARC-Authentication-Results: i=3; mx.google.com; dkim=pass header.i=@nickesselman.nl header.s=cf2024-1 header.b=gKLpi2cU; dkim=pass header.i=@cloudflare-email.net header.s=cf2024-1 header.b=MiyUjuwv; dkim=pass header.i=@kennemerlyceum.nl header.s=selector2 header.b=Yyljc8w3; arc=pass (i=2 spf=pass spfdomain=kennemerlyceum.nl dkim=pass dkdomain=kennemerlyceum.nl dmarc=pass fromdomain=kennemerlyceum.nl); spf=pass (google.com: domain of srs0=fulx=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl designates 104.30.8.105 as permitted sender) smtp.mailfrom="SRS0=fULX=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl"; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=kennemerlyceum.nl
Return-Path: <SRS0=fULX=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl>
Received: from i-baf.cloudflare-email.net (i-baf.cloudflare-email.net. [104.30.8.105]) by mx.google.com with ESMTPS id ffacd0b85a97d-48db9ae3404si20638683f8f.313.2026.10.12.06.50.27 for <nick.esselman@gmail.com> (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128); Mon, 12 Oct 2026 06:50:28 -0700 (PDT)
Received-SPF: pass (google.com: domain of srs0=fulx=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl designates 104.30.8.105 as permitted sender) client-ip=104.30.8.105;
Authentication-Results: mx.google.com; dkim=pass header.i=@nickesselman.nl header.s=cf2024-1 header.b=gKLpi2cU; dkim=pass header.i=@cloudflare-email.net header.s=cf2024-1 header.b=MiyUjuwv; dkim=pass header.i=@kennemerlyceum.nl header.s=selector2 header.b=Yyljc8w3; arc=pass (i=2 spf=pass spfdomain=kennemerlyceum.nl dkim=pass dkdomain=kennemerlyceum.nl dmarc=pass fromdomain=kennemerlyceum.nl); spf=pass (google.com: domain of srs0=fulx=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl designates 104.30.8.105 as permitted sender) smtp.mailfrom="SRS0=fULX=ci=kennemerlyceum.nl=lmwestra@nickesselman.nl"; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=kennemerlyceum.nl
DKIM-Signature: v=1; a=rsa-sha256; s=cf2024-1; d=nickesselman.nl; c=relaxed/relaxed; h=In-Reply-To:References:Date:Subject:To:From:Feedback-ID:from:reply-to:cc :resent-date:resent-from:resent-to:resent-cc:list-id:list-help :list-unsubscribe:list-unsubscribe-post:list-subscribe:list-post :list-owner:list-archive; t=1791813028; x=1792417828; bh=DyX1xcMtlyktjD3GdS KqvUgdJ5QauObWDM6diNTfZTs=; b=gKLpi2cUjfcMQLpMj8+NsduPhx3re1NMJpTcZomwArWdP sf8apSiveFckEPrJmvcG8tv2IdYWyYVHoSTFKXzzW6uIDV8Rk41sk5B1VQH0+jQdSbiE7s+Smwv S3Lq706Kk0i3jgUNQmK8pogYFtMCpRqgSxEpqsVi3P2eimVcNbKeuqChb2dY55mglvLXQ5gkz+p pRxkiaRBkPgKyV7N8fEBu8um94k8qEcZ5+gjcepjPfpxp8cGVg40I8N42vAsYIF6dfemGyFPi03 gnM6h9e0nwQqT0RdSZETNkOlTrV+zWg0cJBKI73gb0vNrNEamZ4K0ESReaTo8Bx8WvM5Vy5A==;
DKIM-Signature: v=1; a=rsa-sha256; s=cf2024-1; d=cloudflare-email.net; c=relaxed/relaxed; h=In-Reply-To:References:Date:Subject:To:From:Feedback-ID:from:reply-to:cc :resent-date:resent-from:resent-to:resent-cc:list-id:list-help :list-unsubscribe:list-unsubscribe-post:list-subscribe:list-post :list-owner:list-archive; t=1791813028; x=1792417828; bh=DyX1xcMtlyktjD3GdS KqvUgdJ5QauObWDM6diNTfZTs=; b=MiyUjuwvVt5LcD1xB3vsIcqwudM+5Z7jSdac00GKZjX+D A4ba0dEMfHSzTFRJSk6fLSIfhYsLrtQrivPUaK89T45PNvr2LugDz7GyxS+dHnyEYi3LGr8SYsV 3eV8XXKFhJqY2ItWdI0xYDMuys39brGCN8vB73EhmrZgQfzRYjImLCK9lcpOTYmZxIarY1FQTrC nPc/U3x3VOprqoxt9Ks0ugGwbaWsSdSWZEefMS1we1gUL+BubOaGBxOd2W63paY4984UbJu1AfC 6HrFSjjDEc4GhvcU72vuSfaqEqw1nxL9yovId/dj9VXg10d142gsrRbbmoaUGCr8Ogiyq5mQ==;
X-Forwarded-To: nick.esselman@gmail.com
X-Forwarded-For: iets@nickesselman.nl nick.esselman@gmail.com
Feedback-ID: nickesselman.nl:1:1:Cloudflare
Received: from MRWPR03CU001.outbound.protection.outlook.com (2a01:111:f403:c207::3) by cloudflare-email.net (cloudflare) id BIXKsOi5VNpl for <iets@nickesselman.nl>; Mon, 12 Oct 2026 13:50:24 +0000
ARC-Seal: i=2; a=rsa-sha256; s=cf2024-1; d=cloudflare-email.net; cv=pass; b=QdUbBk9gxua/IEKkfFJngGSAv6+XZiAxrJMVxv0gXvr/fzrBM9c9BhsroV6DExD/J8XFC8ZNq U8p0cZ6Awmu6cfaeBslJ/rU+p3CmPu+GBAqQcP+LKAEJIqZNuHOrvbOGseSV2Yr4jObxHG29BIy rHzwE68qNJRRYm6XZPiISoM77hhdN+JxHy3OUopGmVSJNe7NznCP6dhEmMSg63ozFb65b3Dwx1D yNq4uEDlTs42id4ZNCas1yH10JvZmLTTEx8qc6i8dRwANyBvjGlkejwslzGyxTzGKRME8MS3Fsa Rqbt+gufUzYefDyK52SnUYvjYEJuV7VG7GRmfIAlvTqg==;
ARC-Message-Signature: i=2; a=rsa-sha256; s=cf2024-1; d=cloudflare-email.net; c=relaxed/relaxed; h=In-Reply-To:References:Date:Subject:To:From:from:reply-to:cc:resent-date :resent-from:resent-to:resent-cc:list-id:list-help:list-subscribe :list-post:list-owner:list-archive; t=1791813025; x=1792417825; bh=DyX1xcMt lyktjD3GdSKqvUgdJ5QauObWDM6diNTfZTs=; b=ZGmjy3crmuEdRCECOhOhTubYCHFCpcY/p4F Ue7ITI0lWGFxVPTiKsiuxrpbkzyz+q8S6xT1uqGEL8N4CfqqPiCQdT2OGjsEJRwJl3vVNXbLRUZ ogxiAUfCDmHEPQIJ5BjSWMeIZyoqAMTJDbXhJHA25kwLYyGHTb4/s2jvcPfRjgXsV10chCGFw3F 4PbQBKTMfH/bxGyq3u5hVWCC0SLzVylveZCZ4EYftZiOulO/bjsLHfDc9+WFWOo8tc9bLIGahk3 IzLg3FPOE+1B8/tq5EszJtIcHwysa6RiyH4kQsQpA8mbUa6ZlY2CQoJj6mBonCHk7xSCvG6ouqS HyYyMhQ==;
ARC-Authentication-Results: i=2; mx.cloudflare.net; dkim=pass header.d=kennemerlyceum.nl header.s=selector2 header.b=Yyljc8w3; dmarc=pass header.from=kennemerlyceum.nl policy.dmarc=none; spf=pass (mx.cloudflare.net: domain of postmaster@MRWPR03CU001.outbound.protection.outlook.com designates 2a01:111:f403:c207::3 as permitted sender) smtp.helo=MRWPR03CU001.outbound.protection.outlook.com; spf=pass (mx.cloudflare.net: domain of lmwestra@kennemerlyceum.nl designates 2a01:111:f403:c207::3 as permitted sender) smtp.mailfrom=lmwestra@kennemerlyceum.nl; arc=pass smtp.remote-ip="2a01:111:f403:c207::3"
Received-SPF: pass (mx.cloudflare.net: domain of lmwestra@kennemerlyceum.nl designates 2a01:111:f403:c207::3 as permitted sender) receiver=mx.cloudflare.net; client-ip=2a01:111:f403:c207::3; envelope-from="lmwestra@kennemerlyceum.nl"; helo=MRWPR03CU001.outbound.protection.outlook.com;
Authentication-Results: mx.cloudflare.net; dkim=pass header.d=kennemerlyceum.nl header.s=selector2 header.b=Yyljc8w3; dmarc=pass header.from=kennemerlyceum.nl policy.dmarc=none; spf=pass (mx.cloudflare.net: domain of postmaster@MRWPR03CU001.outbound.protection.outlook.com designates 2a01:111:f403:c207::3 as permitted sender) smtp.helo=MRWPR03CU001.outbound.protection.outlook.com; spf=pass (mx.cloudflare.net: domain of lmwestra@kennemerlyceum.nl designates 2a01:111:f403:c207::3 as permitted sender) smtp.mailfrom=lmwestra@kennemerlyceum.nl; arc=pass smtp.remote-ip="2a01:111:f403:c207::3"
X-CF-SpamH-Score: 0
ARC-Seal: i=1; a=rsa-sha256; s=arcselector10001; d=microsoft.com; cv=none; b=XnhqOdFGHR/uEE9/lAWyGEMgwDD0uLA1YKDofbpEYKFq2Fs3/liPtso7q5inmzUUZJIXJ6yYBrbvrRdSgb8tGykbuhuoO2KLDhWydmZ4gEiSSvPpTd2fwj/cqwGzZsRZ7K4f1XaPyab1cpGcHsPXx68txnnw7ysCzaB0d/7G6UjbSvJe80sYWqJGsTq+0xLciYAl0uf5fgmJB8fYVxDsM3LI1VFP5xsV2LYPSvNw5PwtTacltSONtuJxLyN4AUYGEvfTBM6ObVC/fCEqOz+GKC48othrErC0LSlCIAlGrL8W2wb0oNmoBaDijDpfxlO2ytZSFwXDcOJ/m3FG4FGBSg==
ARC-Message-Signature: i=1; a=rsa-sha256; c=relaxed/relaxed; d=microsoft.com; s=arcselector10001; h=From:Date:Subject:Message-ID:Content-Type:MIME-Version:X-MS-Exchange-AntiSpam-MessageData-ChunkCount:X-MS-Exchange-AntiSpam-MessageData-0:X-MS-Exchange-AntiSpam-MessageData-1; bh=DyX1xcMtlyktjD3GdSKqvUgdJ5QauObWDM6diNTfZTs=; b=MhLXx+KRxD9Hobd6HWgIBPAtppJoe3AKvn9pF5ZRfaiepJCklPK/2jVXit21XKl5cqbFcp5YdLwojSBpwIFbxQRbhM4JO2SgmluU94fCOF9+OzDSuV/dD6mBj+VdzjdDOUAILzvI5Lo7A9RW8Wpl3zlRGlBcsXiF9UgFv79RRZz0Xt8xZWXIG4J0vmznY7C9sbYjf5xXzL+ypzVBPHiCbJ6dtgfj+pcjVv+YDoV58COam9JJeX53E0RFexgTls6zbzznDp6lw/PWFVJAoARsUFbuO6S+/tBqZ9QOGh7rCIeld/bmnsbcx4HL0/u/dEZfxtaDU6qM4J/dfU6Bh9nb3Q==
ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass smtp.mailfrom=kennemerlyceum.nl; dmarc=pass action=none header.from=kennemerlyceum.nl; dkim=pass header.d=kennemerlyceum.nl; arc=none
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=kennemerlyceum.nl; s=selector2; h=From:Date:Subject:Message-ID:Content-Type:MIME-Version:X-MS-Exchange-SenderADCheck; bh=DyX1xcMtlyktjD3GdSKqvUgdJ5QauObWDM6diNTfZTs=; b=Yyljc8w3KOV+MvCR7GlMGv+KAy4o+YomKygAXnkXiOf+bx/fZLT+ZvRE85rduQaKvsXfn8dLJLGgxs64z63ZfDdWViatHkRBO8z0MMgbdtbQHxnd+1XQOAvuLfEOY82Z/4Mnvb2iW7Xov2nQUBd5LGDmQqfNhaUdWYR1oMWh+jHM6SNMaZF6u+xNk8QtNqG6K8bmsUj/++Ln4UH/00oMleSJXsBpuxhdXQoVkYYJacLhqHNEJcwlT8psOZ0NGILydtUMGqBRvY4f4oUTVhVuQ81eJemSa4eunEUgIt00sugFwa9zF9qHuxCPLQz/FFhMa8hlxslBmLnNFs6LVOYwEw==
Received: from PAXPR03MB7633.eurprd03.prod.outlook.com (2603:10a6:102:1db::7) by MMZPR03MB091211.eurprd03.prod.outlook.com (2603:10a6:190:58::21) with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.21.496.23; Mon, 12 Oct 2026 13:50:20 +0000
Received: from PAXPR03MB7633.eurprd03.prod.outlook.com ([fe80::fe47:7fd2:7791:d4a8]) by PAXPR03MB7633.eurprd03.prod.outlook.com ([fe80::fe47:7fd2:7791:d4a8%4]) with mapi id 15.21.0496.020; Mon, 12 Oct 2026 13:50:19 +0000
From: "L.M. Westra" <lmwestra@kennemerlyceum.nl>
To: "iets@nickesselman.nl" <iets@nickesselman.nl>
Subject: Tijden schoolbel
Thread-Topic: Tijden schoolbel
Thread-Index: Ad1WYoe2n0QUZixqSLGZ/Cq2sdWOEwD7f0hg
Date: Mon, 12 Oct 2026 13:50:19 +0000
Message-ID: <PAXPR03MB7633208676EA54E92BEE7B30CB9F2@PAXPR03MB7633.eurprd03.prod.outlook.com>
References: <GV1PR03MB8838B0D11C848271A7994CA9BE942@GV1PR03MB8838.eurprd03.prod.outlook.com>
In-Reply-To: <GV1PR03MB8838B0D11C848271A7994CA9BE942@GV1PR03MB8838.eurprd03.prod.outlook.com>
Accept-Language: nl-NL, en-US
Content-Language: nl-NL
X-MS-Has-Attach: 
X-MS-TNEF-Correlator: 
authentication-results: mx.microsoft.com 1; dkim=none (message not signed) header.d=none;dmarc=none action=none header.from=kennemerlyceum.nl;
x-ms-publictraffictype: Email
x-ms-traffictypediagnostic: PAXPR03MB7633:EE_|MMZPR03MB091211:EE_
x-ms-office365-filtering-correlation-id: bdf3c494-eeff-408e-01e1-08df2867c104
x-ms-exchange-senderadcheck: 1
x-ms-exchange-antispam-relay: 0
x-microsoft-antispam: BCL:0;ARA:13230040|786006|376014|42112799006|1800799024|23010399003|366016|22082099003|18002099003|10067099003|8096899003|38070700021|261009223027099003|260925021311599003|260925022911599003|56012099006;
x-microsoft-antispam-message-info: 05RjpopFCKTypMyxBvuaHLtPKSziKbJfdP6fZhODn/thAYXv40V+TroVsA5KaZHMs7G7kAfGNRIXAUaZodaMzIpfudPPxWJ0M7LLOjtRY3IYTyRlvD5nCHzPzwxHSnCMtN4jwsqCAB9D6EGBElsYCi8tpx4Udyh7hFbN2W5Q/cmwsP/0L6OPQBY1Vq0FiphCffNNKUjCeY5qP4oD+GITtfqYk1pkIqF3eoyTFp3elX8Nu1ibcPsjyWXgjCCP4Jr+U19D6ZTC0enjyjBGzZm5igmmq+yDC+yh0OSgDQq1Q3ay41J/QM94kTYdrPfKvP402i/STrzedp0CwJQYbpF1FNIIz8F8uoNQjiN9M9uzTJv/aywLnQ4KfgR65RDadtaKQZrgou1ogpcMBx+IFbVDrMQTYsBjdZhJYl/qzHmo6C2Spx0EH5/Iaz5utdwnqFuRzzkVmFNluN0t3mf8ycN1HsLdPkB0nbWndQg9HdYsCDk0maRbS0b8eNjWI9mFZEWs2TRWQ9QX7zuwjRMGGwcoM0AD7hD9ZgoP8mcqmfCnNxYFvtBZmWnOabSFIYNw7HJL1+3FM8msFSKlqO1FKkttoScvi9bKEgZlH6CJtoCWjdBsp4jskRlm9eURJDAwkWcTPdwIky2LKgq1PRvrIXms2I3ApBw3HG3bNYnrOvX/VbObpXTeKVmCU2QJD55G3NKfWUawRNeZPm4Y8nQ0j5HouxlUz6oLKSQT/Lky5yr7+bY=
x-forefront-antispam-report: CIP:255.255.255.255;CTRY:;LANG:nl;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:PAXPR03MB7633.eurprd03.prod.outlook.com;PTR:;CAT:NONE;SFS:(13230040)(786006)(376014)(42112799006)(1800799024)(23010399003)(366016)(22082099003)(18002099003)(10067099003)(8096899003)(38070700021)(261009223027099003)(260925021311599003)(260925022911599003)(56012099006);DIR:OUT;SFP:1102;
x-ms-exchange-antispam-messagedata-chunkcount: 1
x-ms-exchange-antispam-messagedata-0: =?us-ascii?Q?zq6Rn8tNJxTZYMrsDp3euNnPjHnBBivd42NKJlGGpS8O9Zv3ZjO1kdJLaILW?= =?us-ascii?Q?7Dg45mJG5IPeHfaJyvHYsyChp+8+RoYPpzDhPXaiVQLFqyEUYO4kicX8tb5I?= =?us-ascii?Q?PNleqmyJ6wHImR5MPcvpA1HFYJZHBKLRN/WzAymsmt5YzbRgLAcMVFj6dhOd?= =?us-ascii?Q?r0wxsqipNLtS2Fdp5c6ni/z1P8jir5MxeqUVChE7TnC/zX0ZxBlAxQvc0bmx?= =?us-ascii?Q?zsErgJOsc5IZ8ZbuOSlmHPOAHQhXJZQ0Q5RrmNymH5xHO/XpDWWXBtDmdhew?= =?us-ascii?Q?87ikTnN7os5yKCm4+z0wcWwErvy21flUqGRDndBP620hV0alsz/dd8WqrdAe?= =?us-ascii?Q?sSSC7vp3MVMRX8vYDLLFtKDgJttCwE5aakrFHW0YVQgwInmw8YwGo5cnW25f?= =?us-ascii?Q?gKyhoa9G25SPPOHsALCH+sInU3/2ttU2fL2f5u1su1Og8r4v0WNOTwYoU9FT?= =?us-ascii?Q?F4U94u3UVXHxjbzlUYAhJdMRxxCkKCU/u9mKMusFq//uYPFeYF0e+Y7sBG8G?= =?us-ascii?Q?SfKwUCQDMP2hEC/dFvCWtMTAsPfwp6ePilcL/HfejEyGReXlujOJrAgNyZ5x?= =?us-ascii?Q?F9q1O7jSUZ7itOTXGt28oQcA/t6344/SgrKDO77+WiJcFMXL0i1I8zL8MzBj?= =?us-ascii?Q?AQRDmEr3BWXSEXT6/VyNf/i+9+1bpemYupY1OP3fCN/lGf0dA7YzcaUFxe1P?= =?us-ascii?Q?74zS6HvAAos2AruOZ5tzrnH/hoZh+ZTt8DbXWPlM/HUfouQPwk6EtnHP59HO?= =?us-ascii?Q?fJH12sndKVvofOsH417AN4ehQ9EiK08ITN7WE5BU9Pm9KDUYBuDv6SCgN0Nj?= =?us-ascii?Q?iTzTKaaZe4LiA8bdg899gQMVlktHEhSoQ1IP2lJTtXzpYwFiXoJCPOm4afqJ?= =?us-ascii?Q?GsETZ6I8u5iPNsiqVDbmY0ba45bNQtdrdQY7QRWzYKhLpLgRIriO3U/r/cLw?= =?us-ascii?Q?yEqaC7DhF8qzv3qZGu7PDB8NcQ9voDdXNh6fX1zBZcmv53fq0OTg+nzBn2XW?= =?us-ascii?Q?iEdVRkHP4g4BYE8dPY+g6nkm/LBBwmROpMqfhvnvmnby/qGNuCEfyyxHEPS3?= =?us-ascii?Q?XO4P6m5b7x+QSur5dLBEmLV6lULi7zR9BUpIZlhtFPSS0XRGh8ebMABkLCLc?= =?us-ascii?Q?3zFTWWtVbTgzahEsMh4adkotZvDqgWYIniBukA5pLHEQ9TNgW3X3RNW7dOZF?= =?us-ascii?Q?lyR954jW5gVT0NJRKRah7QgUeiV7lyy8xDbziJ6AK8QIv6mxxhViio1J/5Hj?= =?us-ascii?Q?URCaL+8+r5TXF4JH3tUyeZ1T9HBtVZq3SAfvA0OXsow91eimG7qZFCT7JsRj?= =?us-ascii?Q?Dtx4Sa+ruHRc1jqIOaHBdda+Hea2sQ7Dk+Ysok5XFktcHeyoZ6nGFyStK8wC?= =?us-ascii?Q?tE3QEplaF2jZFIYh2MsJtckK+lW3ZjDKOq3pF875KOM95DEVC9HIsHcUmLOW?= =?us-ascii?Q?ezB07qod05j0gR2J+XYnD5vg4pKvlRLf5IjjOZO9nf63u+Tkso3/nydzpNy9?= =?us-ascii?Q?CqgptByPJc02AF4i+L8G/x1eNw8j9xQIwuRn3bF/5+NCgTkmKK+NgCj9CNWs?= =?us-ascii?Q?nNIAvoPmYCZSfR3g8X2fWUycxFiVfjI1yunPpS1Y929I15r4vJ2cQgmhffiX?= =?us-ascii?Q?oA7jkpryIsHS4lNesoDECmuTT80eQkkKEv090iZEuUZ1dih6wmlNEXzDcLnz?= =?us-ascii?Q?dnq8LaSZ8QfnaUqR7ERAaU/x8DFd5r/s4+ZXAuLklOIrVlumpgBei8ddc/lp?= =?us-ascii?Q?4cjMxlXDyQ=3D=3D?=
Content-Type: multipart/alternative; boundary="_000_PAXPR03MB7633208676EA54E92BEE7B30CB9F2PAXPR03MB7633eurp_"
MIME-Version: 1.0
X-OriginatorOrg: kennemerlyceum.nl
X-MS-Exchange-CrossTenant-AuthAs: Internal
X-MS-Exchange-CrossTenant-AuthSource: PAXPR03MB7633.eurprd03.prod.outlook.com
X-MS-Exchange-CrossTenant-Network-Message-Id: bdf3c494-eeff-408e-01e1-08df2867c104
X-MS-Exchange-CrossTenant-originalarrivaltime: 12 Oct 2026 13:50:19.4659 (UTC)
X-MS-Exchange-CrossTenant-fromentityheader: Hosted
X-MS-Exchange-CrossTenant-id: c76c64ed-67e9-4f1c-a173-61edb9b49ed1
X-MS-Exchange-CrossTenant-mailboxtype: HOSTED
X-MS-Exchange-CrossTenant-userprincipalname: t/2jzE3ZbBM5wAPrS/mTdIB05SeUvuqKCK8NQPnyKnaT55XcUTEsxfbrS3xmzye2gDTEOeRZtU4c3yD3qkrtmjZbTCvM1Bm/2Q6kB+l4Ycs=
X-MS-Exchange-Transport-CrossTenantHeadersStamped: MMZPR03MB091211

--_000_PAXPR03MB7633208676EA54E92BEE7B30CB9F2PAXPR03MB7633eurp_
Content-Type: text/plain; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable


Regulier rooster
Uur
tijd
Type bel

08.10
2x signaal (1e bel)
1
08.15 uur
1x signaal
2
09.05 uur
1x signaal
3
09.55 uur
1x signaal
Pauze
10.45 uur
1x signaal

11.00
2x signaal (1e bel)
4
11.05 uur
1x
5
11.55 uur
1x
Pauze
12.45 uur
1x

13.10
2x signaal (1e bel)
6
13.15 uur
1x
7
14.05 uur
1x
8
14.55 uur
1x
9
15.45 uur
1x
eind
16.35
1x
Verkort rooster
Uur
tijd
Type bel

08.10
2x
1
08.15 uur
1x
2
08.55 uur
1x
3
09.35 uur
1x
Pauze
10.15 uur
1x

10.30
2x
4
10.35 uur
1x
5
11.15 uur
1x
6
11.55 uur
1x
Pauze
12.35 uur
1x

13.00
2x
7
13.05 uur
1x
8
13.45 uur
1x
9
14.25 uur
1x

10-minutenbel (oudergesprekken)
....
Tijd
Type bel

16.00
1x

16.10
1x

16.20
1x

16.30
1x

16.40
1x

16.50
1x

... ...
1x

...
1x

21.00
1x

21.10
1x

21.20
1x

21.30
1x

________________________________
Kennemer Lyceum

Bezoekadres:
Adriaan Stoopplein 7
2051 KA Overveen

Postadres:
Postbus 8
2050 AA Overveen
T: +31 (023) 522 1060
W: www.kennemerlyceum.nl

Vrijwaring
De informatie opgenomen in dit bericht kan vertrouwelijk zijn en is uitslui=
tend bestemd voor de geadresseerde. Indien u dit bericht onterecht ontvangt=
 wordt u verzocht de inhoud niet te gebruiken en de afzender direct te info=
rmeren door het bericht te retourneren.

Disclaimer
The information contained in this message may be confidential and is intend=
ed to be exclusively for the addressee. Should you receive this message unr=
ightfully, please do not use the contents herein and notify the sender imme=
diately by returning this email.

--_000_PAXPR03MB7633208676EA54E92BEE7B30CB9F2PAXPR03MB7633eurp_
Content-Type: text/html; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable

<html xmlns:v=3D"urn:schemas-microsoft-com:vml" xmlns:o=3D"urn:schemas-micr=
osoft-com:office:office" xmlns:w=3D"urn:schemas-microsoft-com:office:word" =
xmlns:m=3D"http://schemas.microsoft.com/office/2004/12/omml" xmlns=3D"http:=
//www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=3D"Content-Type" content=3D"text/html; charset=3Dus-ascii"=
>
<meta name=3D"Generator" content=3D"Microsoft Word 15 (filtered medium)">
<style><!--
/* Font Definitions */
@font-face
=09{font-family:"Cambria Math";
=09panose-1:2 4 5 3 5 4 6 3 2 4;}
@font-face
=09{font-family:"Calibri Light";
=09panose-1:2 15 3 2 2 2 4 3 2 4;}
@font-face
=09{font-family:Aptos;}
/* Style Definitions */
p.MsoNormal, li.MsoNormal, div.MsoNormal
=09{margin:0cm;
=09font-size:12.0pt;
=09font-family:"Aptos",sans-serif;
=09mso-ligatures:standardcontextual;
=09mso-fareast-language:EN-US;}
.MsoChpDefault
=09{mso-style-type:export-only;
=09font-size:10.0pt;
=09mso-ligatures:none;}
@page WordSection1
=09{size:612.0pt 792.0pt;
=09margin:70.85pt 70.85pt 70.85pt 70.85pt;}
div.WordSection1
=09{page:WordSection1;}
--></style><!--[if gte mso 9]><xml>
<o:shapedefaults v:ext=3D"edit" spidmax=3D"1026" />
</xml><![endif]--><!--[if gte mso 9]><xml>
<o:shapelayout v:ext=3D"edit">
<o:idmap v:ext=3D"edit" data=3D"1" />
</o:shapelayout></xml><![endif]-->
</head>
<body lang=3D"NL" link=3D"#467886" vlink=3D"#96607D" style=3D"word-wrap:bre=
ak-word">
<div class=3D"WordSection1">
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
<p class=3D"MsoNormal"><b>Regulier rooster<o:p></o:p></b></p>
<table class=3D"MsoNormalTable" border=3D"1" cellspacing=3D"3" cellpadding=
=3D"0" style=3D"border:solid windowtext 1.0pt">
<thead>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>Uur<o:p></o:p></b></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>tijd<o:p></o:p></b></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal"><b>Type bel<o:p></o:p></b></p>
</td>
</tr>
</thead>
<tbody>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">08.10<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">2x signaal (1<sup>e</sup> bel)<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">08.15 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x signaal<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">2<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">09.05 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x signaal<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">3<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">09.55 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x signaal<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">Pauze<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">10.45 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x signaal<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">11.00<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">2x signaal (1<sup>e</sup> bel)<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">4<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">11.05 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">5<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">11.55 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">Pauze<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">12.45 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">13.10<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">2x signaal (1<sup>e</sup> bel)<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">6<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">13.15 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">7<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">14.05 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">8<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">14.55 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">9<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">15.45 uur<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">eind<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.35<o:p></o:p></p>
</td>
<td valign=3D"top" style=3D"border:solid windowtext 1.0pt;padding:.75pt .75=
pt .75pt .75pt">
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
</tbody>
</table>
<p class=3D"MsoNormal"><b>Verkort rooster<o:p></o:p></b></p>
<table class=3D"MsoNormalTable" border=3D"1" cellspacing=3D"3" cellpadding=
=3D"0" style=3D"border:solid windowtext 1.0pt">
<thead>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>Uur<o:p></o:p></b></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>tijd<o:p></o:p></b></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>Type bel<o:p></o:p></b></p>
</td>
</tr>
</thead>
<tbody>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">08.10<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">2x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">08.15 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">2<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">08.55 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">3<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">09.35 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">Pauze<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">10.15 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">10.30<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">2x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">4<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">10.35 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">5<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">11.15 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">6<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">11.55 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">Pauze<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">12.35 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">13.00<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">2x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">7<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">13.05 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">8<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">13.45 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">9<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">14.25 uur<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
</tbody>
</table>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
<p class=3D"MsoNormal"><b>10-minutenbel (oudergesprekken)<o:p></o:p></b></p=
>
<table class=3D"MsoNormalTable" border=3D"1" cellspacing=3D"3" cellpadding=
=3D"0" style=3D"border:solid windowtext 1.0pt">
<thead>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>&#8230;.<o:p></o:p></b></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>Tijd<o:p></o:p></b></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><b>Type bel<o:p></o:p></b></p>
</td>
</tr>
</thead>
<tbody>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.00<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.10<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.20<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.30<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.40<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">16.50<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">&#8230; &#8230;<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">&#8230;<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">21.00<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">21.10<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">21.20<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
<tr>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">21.30<o:p></o:p></p>
</td>
<td style=3D"border:solid windowtext 1.0pt;padding:.75pt .75pt .75pt .75pt"=
>
<p class=3D"MsoNormal">1x<o:p></o:p></p>
</td>
</tr>
</tbody>
</table>
<p class=3D"MsoNormal"><o:p>&nbsp;</o:p></p>
</div>
<hr>
<font size=3D"small">Kennemer Lyceum<br>
<br>
Bezoekadres:<br>
Adriaan Stoopplein 7<br>
2051 KA Overveen<br>
<br>
Postadres:<br>
Postbus 8<br>
2050 AA Overveen<br>
T: +31 (023) 522 1060<br>
W: www.kennemerlyceum.nl<br>
<br>
Vrijwaring<br>
De informatie opgenomen in dit bericht kan vertrouwelijk zijn en is uitslui=
tend bestemd voor de geadresseerde. Indien u dit bericht onterecht ontvangt=
 wordt u verzocht de inhoud niet te gebruiken en de afzender direct te info=
rmeren door het bericht te retourneren.<br>
<br>
Disclaimer<br>
The information contained in this message may be confidential and is intend=
ed to be exclusively for the addressee. Should you receive this message unr=
ightfully, please do not use the contents herein and notify the sender imme=
diately by returning this email.
</font>
</body>
</html>

--_000_PAXPR03MB7633208676EA54E92BEE7B30CB9F2PAXPR03MB7633eurp_--