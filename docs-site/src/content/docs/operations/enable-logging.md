---
title: Enable logging
description: Turn on structured server logs for requests, WebSockets, and PTY lifecycle events.
---

term-serve writes structured `logfmt` logs to `stderr`. Normal startup output and CLI help stay on `stdout`, so logs can be redirected or collected separately.

By default, term-serve logs `info`, `warn`, and `error` events. Enable verbose logging when you need per-request and WebSocket diagnostics.

## Enable verbose logs

Use `--verbose` for one run:

```bash
term-serve --verbose
```

Or set it in `term-serve.conf`:

```toml
[logging]
verbose = true
```

Verbose mode enables `debug` logs and includes error stack traces when available.

## What gets logged

Default logs include lifecycle and warning events such as:

- server listen details
- Cloudflare tunnel startup and exit events
- PTY spawn and exit events
- denied WebSocket upgrades
- server startup and request handling errors

Verbose logs also include:

- HTTP access lines with method, path, status, duration, request ID, and remote IP
- successful WebSocket upgrades
- WebSocket open and close events
- terminal resize events
- PTY command argv details

Example line:

```text
ts=2026-05-16T12:00:00.000Z lvl=debug event=http_access method=GET path=/api/status status=200 ms=3 req_id=abc123 remote_ip=127.0.0.1
```

## Capture logs in a file

Redirect `stderr` to a file while keeping startup output on your terminal:

```bash
term-serve --verbose 2>>term-serve.log
```

To capture only logs from a public or tunnel session:

```bash
term-serve --public --auth-token "$AUTH_TOKEN" --verbose 2>>term-serve.log
```

## Follow systemd logs

If term-serve runs as a user service, logs are captured by journald:

```bash
journalctl --user -u term-serve.service -f
```

Enable verbose logging in the service command when you need request-level diagnostics:

```ini
ExecStart=%h/.local/bin/term-serve --host=0.0.0.0 --auth-token=${AUTH_TOKEN} --verbose --cwd=%h
```

## Security notes

- Logs include request paths, remote IPs, and connection IDs in verbose mode.
- Auth tokens are accepted in WebSocket query strings; avoid proxy or tunnel access logs that record full query strings.
- Do not paste verbose logs into public issues without checking paths, IPs, commands, and environment-specific details first.
