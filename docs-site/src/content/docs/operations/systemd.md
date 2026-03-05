---
title: Run as a systemd Service
description: Keep term-serve running on boot/login on Linux.
---

Use a user-level systemd unit to run term-serve continuously.

## 1) Create an environment file

`~/.config/term-serve/env`:

```ini
PORT=31337
AUTH_TOKEN=your-secure-auth-token-here
```

Restrict permissions:

```bash
chmod 600 ~/.config/term-serve/env
```

## 2) Create user service unit

`~/.config/systemd/user/term-serve.service`:

```ini
[Unit]
Description=term-serve (user)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/term-serve --host=0.0.0.0 --auth-token=${AUTH_TOKEN} --cwd=%h
Restart=on-failure
RestartSec=1
EnvironmentFile=%h/.config/term-serve/env

[Install]
WantedBy=default.target
```

## 3) Enable and start

```bash
systemctl --user daemon-reload
systemctl --user enable --now term-serve.service
```

## 4) Tail logs

```bash
journalctl --user -u term-serve.service -f
```

## Notes

- If you bind to non-local interfaces, always set an explicit token.
- Prefer TLS and a perimeter (VPN / tunnel / access-controlled proxy).
