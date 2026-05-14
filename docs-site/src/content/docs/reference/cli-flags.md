---
title: CLI Flags
description: Command-line flags and positional command behavior.
---

Usage shape:

```bash
term-serve [options] [command [args...]]
```

Options must appear before positional `command`.

## Core flags

| Flag | Meaning |
| --- | --- |
| `-p, --port <port>` | Port to listen on (default `31337`) |
| `--host <ip\|name>` | Bind address (default `127.0.0.1`) |
| `--public` | Alias for `--host 0.0.0.0` |
| `--tunnel` | Start a Cloudflare quick tunnel with `cloudflared` and print the tunnel URL/QR code |
| `--auth-token <secret>` | Require token for WebSocket connections |
| `-C, --cwd <path>` | Start shell/command in this directory |
| `--config <path>` | Load config from explicit file path |
| `-t, --theme <name>` | Set terminal theme ID |
| `--list-themes` | Print supported terminal theme IDs |
| `--font <font>` | Set terminal font family |
| `--font-size <size[,mobile_size]>` | Set terminal font size(s) |
| `--verbose` | Enable debug logs |
| `-v, --version` | Show version |
| `-h, --help` | Show usage help |

## Positional command mode

When you provide a command, term-serve runs that command in the PTY on client connect.

```bash
term-serve htop -d 10
term-serve --cwd ~/projects opencode
```

Use `--` to avoid parsing command args as term-serve options:

```bash
term-serve --port 4141 -- rg --hidden TODO src
```

## Tunnel mode

`--tunnel` requires `cloudflared` to be installed and available on `PATH`.

```bash
term-serve --tunnel
term-serve --tunnel --auth-token "replace-with-strong-secret"
```

Tunnel mode exposes the local server through a temporary `https://*.trycloudflare.com` URL and requires auth for WebSocket terminal access.
