# term-serve

ghostty-web + bun server: serve a local terminal in the browser (WebSocket + PTY).

## Coding Style and Conventions

- Keep files <= ~200 LOC; functions <= ~50 LOC. Split larger files by concern rather than extracting utilities.
- Exception: test files in `tests/` can exceed ~200 LOC when keeping related assertions together improves test clarity and signal.
- Add JSDoc comments for all helper functions (exported or not) with a description, parameters, and return type. Keep them in sync with the actual code; don't let them become stale.
- Some duplication is ok (WET > DRY) for clarity and to avoid over-abstraction. Too much duplication is bad.
- Prefer explicit return types for functions.
- Don't use single line blocks (`if (x) return y;`); prefer braces and newlines for clarity.
- Prefer function declarations over function expressions, except when a function expression improves readability (e.g. when passing as an argument).
- stdout is for server startup output and CLI help/version output; stderr is diagnostics; exit codes: 2 usage, 1 runtime, 0 success.
- Use `click` for mouse/touch/keyboard activation, `pointer*` events for gesture-like interactions and early interception; avoid `touch*` listeners unless there is a browser-specific reason pointer events cannot cover the case.

## Verification

- Before marking work as complete:
  - if code files or project config files were added or changed run the `/verify` command

## Dependency Notes

- `ghostty-web` is patched via Bun `patchedDependencies` to fix selection coordinate math with scrollback (mobile copy mode regression after terminal auto-scroll).
- Patch file: `patches/ghostty-web@0.4.0-next.7.g03ead6e.patch`.
- If `ghostty-web` is upgraded, re-check whether upstream includes the fix and remove or refresh the local patch accordingly.

## Roadmap

- Bundled AI agent (Pi) - completely turned off by default, use it if you like with your own API keys (`OpenRouter`, `OpenCode Zen`, etc.) or OAuth logins (`OpenAI` / `Github Copilot` / `Google Gemini`).
- Electron based client app - manage multiple `term-serve` sessions, provide a richer UI (tabs, settings form, etc.), and integrate with the OS (native notifications, system-tray/dock, etc.).

## Repo Map

- `src/cli.ts`: CLI entrypoint (parse args -> resolve runtime/server opts -> start server/tunnel -> print URL/token/QR/help output)
- `src/bin/term-serve.ts`: shebang shim for running the CLI from source
- `src/parse-args.ts`: CLI args parser into `Opts` (flags, positional command mode, and `--internal=...` support)
- `src/resolve-opts.ts`: precedence resolver for defaults/config/env/CLI runtime options
- `src/config-file.ts`: config discovery/loading helpers (`--config` or local `term-serve.conf`)
- `src/utils/cli-utils.ts`: usage/version/theme-list output + runtime/server option assembly
- `src/utils/cloudflared-process.ts`: low-level cloudflared process availability/stream helpers
- `src/utils/cloudflared-tunnel.ts`: cloudflared quick tunnel startup and tunnel URL parsing helpers
- `src/utils/parse-args-utils.ts`: internal command parser for `--internal=domain:subcommand`
- `src/utils/safe-result.ts`: tuple-style error helpers (`Result`, `asResult`, `asAsyncResult`)
- `src/utils/startup-output.ts`: startup access URL resolution and terminal QR code rendering
- `src/utils/tunnel-lifecycle.ts`: optional tunnel startup/cleanup orchestration
- `src/types/core.ts`: core shared CLI/runtime option types (`Opts`)
- `src/types/utils.ts`: shared TypeScript utility types
- `src/types/assets.d.ts`: TypeScript declarations for bundled wasm/font asset imports
- `src/lib/server/http.ts`: Bun server bootstrap + fetch handler (root proxy, ws upgrade, font asset responses)
- `src/lib/server/routes.ts`: Bun route table (`/__index`, wasm, `/api/status`, `/api/config`, `/api/auth/verify`)
- `src/lib/server/websockets.ts`: ws upgrade/auth checks + websocket handler wiring
- `src/lib/server/pty.ts`: PTY creation (shell/command mode), IO, resize, cleanup, display command formatting
- `src/lib/server/auth.ts`: auth token generation + timing-safe token comparison
- `src/lib/server/font-embedding.ts`: request-path -> bundled font resolution (hashed/unhashed + cache policy)
- `src/lib/server/request-origin-resolver.ts`: best-effort client IP extraction from forwarded headers/requestIP
- `src/lib/server/logger.ts`: structured logfmt logger + HTTP access logging helper
- `src/lib/server/config-file-parser.ts`: TOML config object validation/parsing into `Opts`
- `src/lib/server/utils/http-utils.ts`: HTTP helpers (ETag, If-None-Match matching, auth header parsing, local/wildcard-host checks)
- `src/lib/server/utils/logger-utils.ts`: log color helpers for levels/events/statuses
- `src/lib/server/utils/websockets-open-handler.ts`: ws open lifecycle (spawn PTY, wire data/exit handlers)
- `src/lib/server/utils/websockets-message-handler.ts`: ws message lifecycle (resize protocol + keystroke forwarding)
- `src/lib/server/utils/websockets-close-handler.ts`: ws close lifecycle cleanup (dispose listeners + kill PTY)
- `src/lib/server/utils/config-file-parser-utils.ts`: shared TOML parsing/validation primitives and error helpers
- `src/lib/server/utils/config-file-parser-sections.ts`: section parsers for `[server]`, `[auth]`, `[shell]`, `[terminal]`, `[logging]`, `[command]`
- `src/lib/client/index.html`: browser terminal page markup and mobile toolbar buttons
- `src/lib/client/style.css`: terminal page styles, layout, and responsive rules
- `src/lib/client/app.ts`: browser entrypoint (initializes terminal + UI wiring)
- `src/lib/client/terminal.ts`: terminal construction helpers (Ghostty load + theme/font setup + createTerminal)
- `src/lib/client/terminal-themes.ts`: theme catalog + theme id validation + container background handling
- `src/lib/client/themes/*`: built-in theme definitions (`ghostty-web` `ITheme`)
- `src/lib/client/websockets.ts`: browser WebSocket connect/send/resize helpers
- `src/lib/client/auth.ts`: browser auth-token prompt + session storage
- `src/lib/client/config.ts`: fetch `/api/config` (auth + terminal font settings)
- `src/lib/client/key-sequences.ts`: toolbar send-keys mapping and sticky Ctrl/Alt modifiers
- `src/lib/client/keymaps-palette-ui.ts`: keymaps palette modal UI, filtering, and keyboard shortcuts
- `src/lib/client/keymaps-palette.ts`: keymaps catalog and key-sequence translation
- `src/lib/client/resize.ts`: fit addon setup + viewport/mobile keyboard resize handling
- `src/lib/client/terminal-ui.ts`: status indicator, toolbar focus behavior, scroll-gutter/input-lock helpers
- `src/lib/client/terminal-fonts.ts`: terminal font-family + font-size resolution and font preloading
- `src/lib/client/shell-close-confirm.ts`: accidental shell-exit confirmation heuristics (Ctrl+D / exit)
- `src/lib/client/clipboard/index.ts`: clipboard toolbar wiring and mobile copy-mode entrypoint
- `src/lib/client/clipboard/clipboard.ts`: clipboard read/write fallbacks and copy/paste flows
- `src/lib/client/clipboard/mobile-selection.ts`: mobile copy mode orchestration and toolbar/pointer handlers
- `src/lib/client/clipboard/mobile-selection-engine.ts`: selection cursor/phase state machine and movement logic
- `src/lib/client/clipboard/mobile-selection-ui.ts`: copy-mode UI state, keyboard lock, and hint behavior
- `src/lib/client/mobile-scroll.ts`: pointer-based scroll-gutter gestures mapped to wheel events
- `src/lib/client/utils.ts`: DOM lookup + environment helpers (session storage, origin parts, etc.)
- `src/lib/client/ansi.ts`: ANSI/control sequence helpers for banner/MOTD/messages and shared SGR wrappers
- `src/lib/client/fonts/*`: bundled terminal fonts (woff2)
- `tests/cli.test.ts`: CLI contract tests
- `tests/auth.test.ts`: auth token generation and force-auth behavior tests
- `tests/cloudflared-tunnel.test.ts`: cloudflared tunnel URL parsing and target URL tests
- `tests/resolve-opts.test.ts`: runtime option precedence and bind/command intent resolution tests
- `tests/config-file.test.ts`: config discovery/loading/parsing integration tests
- `tests/server.test.ts`: HTTP routes and WebSocket upgrade behavior tests
- `tests/pty.test.ts`: PTY lifecycle and runtime behavior tests
- `tests/terminal.test.ts`: client websocket/send-keys/resize/mobile interaction tests
- `tests/clipboard.test.ts`: clipboard and mobile selection behavior tests
- `tests/keymaps-palette.test.ts`: keymaps translation and palette UI regression tests
