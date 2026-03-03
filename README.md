# term-serve

Serve a local terminal in the browser (WebSocket + PTY).

## Features

- 🌐 Starts an HTTP server on port 31337 (configurable via `PORT` env var or `-p/--port`) and host `127.0.0.1` (configurable via `--host`, or `--public` as an alias for `0.0.0.0`).
- 🐚 Opens a real shell session (`bash`, `zsh`, etc.) by default.
- ▶️ Can optionally take a command (and args) as positional arguments and run it in the PTY when a client connects (eg. `btop`, `htop -d 10`).
- 🔐 Optional shared-secret auth token for WebSocket connections when binding non-locally (auto-generated if not provided).
- ⌨️ Keymaps palette UI for quickly sending common key sequences.
- 📱 Mobile-friendly UI with an on-screen toolbar (Esc/Tab/arrows + sticky Ctrl/Alt) for touch devices.
- 📋 Mobile copy mode with scrollback-aware selection handles and one-tap copy.
- 📎 Built-in clipboard copy/paste flows with fallbacks when direct clipboard access is blocked.
- 📐 Automatic terminal fit/resize handling (including orientation changes and mobile keyboard resizing).
- 🛑 Accidental shell-exit confirmation prompts for `Ctrl+D` / `exit` / `logout`.
- 🎨 Built-in support for popular terminal themes (Catppuccin, Dracula, GitHub, Gruvbox, etc.), selectable via `--theme`.
- 🔤 Supports monospace programming fonts: `JetBrains Mono` (default/bundled), `Iosevka`, `Fira Code`, `Cascadia Code`, `Hack`, `Source Code Pro` etc. with glyphs/devicons `Nerd Font Symbols Only` (bundled).
- 🔠 Configurable terminal font size (`--font-size`, optional mobile override) with font preloading to reduce first-render glitches.
- 🧭 Automatic protocol detection (`HTTP/HTTPS`, `WS/WSS`)
- 🔀 Supports reverse proxies (`caddy`, `nginx`, `ngrok`, etc.) via `X-Forwarded-*` headers
- 🧾 Verbose structured logs (`--verbose`) with request/connection IDs and best-effort remote IP detection.
- 📦 Fast, single-binary distribution.

## Roadmap

- Bundled AI agent (Pi) - completely turned off by default, use it if you like with your own API keys (`OpenRouter`, `OpenCode Zen`, etc.) or OAuth logins (`OpenAI` / `Github Copilot` / `Google Gemini`).
- Electron based client app - manage multiple `term-serve` sessions, provide a richer UI (tabs, settings form, etc.), and integrate with the OS (native notifications, system-tray/dock, etc.).

## Non-Goals

- Persistent session management (reconnect/attach to the same PTY after a refresh/disconnect) -> Use a terminal multiplexer like `tmux` or `screen` inside the served shell if you need that.
- Split panes -> Use `tmux` inside the served shell if you need split panes.
- Multiple tabs -> Each `term-serve` instance serves a single terminal session: run multiple instances if you need more.

## Dependency patch notes

- `ghostty-web` is currently patched via Bun `patchedDependencies` to fix selection coordinates when scrollback exists.
- Without this patch, API-driven selection (used by mobile copy mode) can highlight/copy the wrong region after terminal auto-scroll.
- Patch file: `patches/ghostty-web@0.4.0-next.7.g03ead6e.patch`.

## ⚠️ IMPORTANT SECURITY WARNING

**This server provides full shell access (or whatever command you run). Treat access as root-equivalent on your machine.**

By default, it only binds to `127.0.0.1` (localhost), which keeps it local to your machine.

If you bind to a non-local interface (eg. `--public` / `--host 0.0.0.0` / `--host <LAN IP>`), term-serve enables a minimal shared-secret auth token for WebSocket connections:

- You can set it explicitly with `--auth-token <secret>`.
- If you bind non-locally without `--auth-token`, term-serve generates a secure random token and prints it once at startup.
- The browser UI prompts for the token (stored in memory + `sessionStorage`, not `localStorage`).

Notes:

- This is intentionally minimal auth (single shared token; no accounts; no rate limiting). Anyone with the token has a live terminal session.
- The token is sent to `/ws` as a WebSocket query parameter (`/ws?...&token=...`). If you use a reverse proxy/tunnel, ensure it does not log query strings, and prefer HTTPS/WSS.
- HTTP routes like `/` remain publicly reachable on that bind address; the PTY session is gated by the WebSocket token.

If you expose this beyond localhost, you should still put it behind a strong perimeter (VPN like [Tailscale](https://tailscale.com), SSH tunnel, or an access-controlled tunnel such as Cloudflare Access/ngrok), and use TLS.

## Usage

```shell
> term-serve --help

Serve a local terminal in the browser (WebSocket + PTY).

Usage:
  ${name} [options] [command [args...]]

Notes:
  CLI options must come before the optional positional argument "command" and its arguments.
  If a command is provided, everything after it is treated as that command’s arguments and is passed through unchanged.

Options:
  -p, --port <port>                       Port to listen on, default: 31337
      --host <ip|name>                    Bind address, default: 127.0.0.1 (enables auth token by default if not localhost)
      --public                            Alias for --host 0.0.0.0 (enables auth token by default)
      --auth-token <secret>               Require a token for WebSocket connections
  -C, --cwd <path>                        Start in the provided directory, default: current working directory
      --config <path>                     Load config from explicit file path. If not provided, the app tries to
                                            load "./term-serve.conf" from the invocation directory (if present).
  -t, --theme <name>                      Terminal theme id, default: gruvware-dark
      --list-themes                       List available terminal theme ids
      --font <font>                       Local system font to use for the terminal instead of the bundled "TermServe Mono"
                                            (patched JetBrains Mono Nerd Font). Examples: "Iosevka", "Fira Code", etc.
      --font-size <size[,mobile_size]>    Terminal font size(s) for default viewport, optionally mobile. Examples: 10 or 14,10
      --verbose                           Enable debug logs
  -v, --version                           Show version
  -h, --help                              Show help

Examples:
  PORT=8080 term-serve                    # Custom port set via environment variable
  term-serve --public                     # LAN access (prints an auth token)
  term-serve htop -d 10                   # Serve system monitoring output locally via htop command with a 10 second delay
  term-serve --cwd ~/projects \
    --host 0.0.0.0 --auth-token secret \
    --verbose -p 3000 opencode            # Start in ~/projects, bind to all interfaces, require auth token "secret",
                                          #   enable verbose logging, and run "opencode" command
```

## Config file

`term-serve` supports an optional, auto-loaded project-local config file named `term-serve.conf`, or any arbitrary path and filename provided via `--config`.

File specs:

- `TOML` format (human-friendly, supports comments, and widely used for config files)
- Flat keys support for conveniently setting simple options (`host`, `port` and `auth_token`)
- Sectioned keys for more complex grouping of related options (`[server]`, `[auth]`, `[shell]`, `[terminal]`, `[logging]`, `[command]`)
- Mixing flat and sectioned keys is allowed, but duplicate keys (eg. `port` at both top-level and `[server]`) are treated ad config errors.

Discovery order:

- `--config <path>` (explicit path always wins)
- `./term-serve.conf` in the invocation working directory (no upward/global search)

Options precedence:

- built-in defaults < config file < env (only `PORT` can be set via env) < CLI options

Full config example:

```toml
# Sample config file for `term-serve` that includes all the supported options and default values for them.

[server]

# Port to listen on.
port = 31337

# Bind address (enables auth token by default if not localhost).
host = "127.0.0.1"

[auth]

# Require a token for WebSocket connections. You might omit this for localhost, but always set it for 0.0.0.0.
# auth_token = "secret"

[shell]

# Directory to start in (default: current working directory).
# cwd = "/tmp"

[terminal]

# Terminal theme id.
theme = "gruvware-dark"

# Local system font to use for the terminal.
font = "TermServe Mono" # bundled patched JetBrains Mono Nerd Font

# Terminal font size(s): either a single number, or [desktop,mobile].
font_size = [11,8]

[logging]

# Enable debug logs.
verbose = false

[command]

# Runs a command instead of an interactive login shell.
# argv = ["top", "-d", "10"]
```

Minimal top-level example (only the `host`, `port` and `auth_token` keys subset is allowed top-level):

```toml
host = "100.64.12.31"
port = 3001
auth_token = "my-project-token"
```

## Popular themes

- andromeeda
- aurora-x
- ayu-dark
- catppuccin-frappe
- catppuccin-latte
- catppuccin-macchiato
- catppuccin-mocha
- dark-plus
- dracula
- dracula-soft
- everforest-dark
- everforest-light
- github-dark
- github-dark-default
- github-dark-dimmed
- github-dark-high-contrast
- github-light
- github-light-default
- github-light-high-contrast
- gruvbox-dark-hard
- gruvbox-dark-medium
- gruvbox-dark-soft
- gruvbox-light-hard
- gruvbox-light-medium
- gruvbox-light-soft
- gruvware-dark
- gruvware-light
- houston
- kanagawa-dragon
- kanagawa-lotus
- kanagawa-wave
- laserwave
- light-plus
- material-theme
- material-theme-darker
- material-theme-lighter
- material-theme-ocean
- material-theme-palenight
- min-dark
- min-light
- monokai
- night-owl
- nord
- one-dark-pro
- one-light
- plastic
- poimandres
- red
- rose-pine
- rose-pine-dawn
- rose-pine-moon
- slack-dark
- slack-ochin
- snazzy-light
- solarized-dark
- solarized-light
- synthwave-84
- tokyo-night
- vesper
- vitesse-black
- vitesse-dark
- vitesse-light

## Running as a service on Linux

To start Term-Serve on boot/login, you can run it as a systemd service.

- If you bind non-locally (for example using `--public` or `--host 0.0.0.0`), set an explicit `--auth-token` to use when connecting from the client. Create an environment file `~/.config/term-serve/env` with `chmod 600` and the following content:

```ini
PORT=31337
AUTH_TOKEN=your-secure-auth-token-here
```

- Create user unit file `~/.config/systemd/user/term-serve.service` (assumes app lives in `~/.local/bin/term-serve`):

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

- Enable and start:

```sh
systemctl --user daemon-reload
systemctl --user enable --now term-serve.service
```

- Check logs:

```sh
journalctl --user -u term-serve.service -f
```

## Optional reverse proxy example (Caddy: TLS + redacted query logging)

```caddyfile
term-serve.example.com {
  # Keep access logs, but redact the WebSocket auth token query param.
  log {
    output file /var/log/caddy/term-serve.access.log
    format filter {
      request>uri query {
        replace token REDACTED
      }
      wrap json
    }
  }

  reverse_proxy 127.0.0.1:31337 {
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
  }
}

```

## Optional reverse proxy example (nginx: TLS + redacted query logging)

```nginx
# Redirect HTTP -> HTTPS
server {
    listen 80;
    server_name term-serve.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name term-serve.example.com;

    ssl_certificate /etc/letsencrypt/live/term-serve.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/term-serve.example.com/privkey.pem;

    # Redacted log format: uses $uri (path only), never $request_uri (path+query).
    log_format termserve_redacted '$remote_addr - $remote_user [$time_local] '
        '"$request_method $uri $server_protocol" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent"';
    access_log /var/log/nginx/term-serve.access.log termserve_redacted;

    location / {
        proxy_pass http://127.0.0.1:31337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## License

MIT.

See `LICENSE.txt` for the full license text.
