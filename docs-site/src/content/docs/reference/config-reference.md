---
title: Config Schema
description: Supported keys for term-serve.conf.
---

`term-serve.conf` uses TOML.

## Top-level keys

Only these flat keys are valid:

| Key | Type | Notes |
| --- | --- | --- |
| `host` | string | Bind address |
| `port` | number | Listening port |
| `auth_token` | string | Shared WebSocket auth token |

## Sections

### `[server]`

| Key | Type | Notes |
| --- | --- | --- |
| `port` | number | Same meaning as top-level `port` |
| `host` | string | Same meaning as top-level `host` |
| `public` | boolean | `true` maps to host `0.0.0.0` |

### `[auth]`

| Key | Type |
| --- | --- |
| `auth_token` | string |

### `[shell]`

| Key | Type |
| --- | --- |
| `cwd` | string |

### `[terminal]`

| Key | Type | Notes |
| --- | --- | --- |
| `theme` | string | Must match a known theme ID |
| `font` | string | Font family name |
| `font_size` | number OR `[number, number]` | Single size or `[desktop, mobile]` |

### `[logging]`

| Key | Type |
| --- | --- |
| `verbose` | boolean |

### `[command]`

| Key | Type | Notes |
| --- | --- | --- |
| `argv` | string[] | Non-empty array; first element is command |

## Validation rules

- Unknown keys/sections fail parsing.
- Do not duplicate a value in both top-level and section form (for example `port` + `[server].port`).
- Do not combine host intent with public intent in the same config.

See [Configuration File](../../configuration/) for practical examples.
