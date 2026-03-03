---
name: verify
description: Run this repo’s quality checks and relevant tests using the verify subagent before considering a change complete.
---

## Important

This skill should always be run using the `verify` subagent!

## Default quality checks (run these exact steps in order unless task says otherwise)

```bash
bun run check        # format and lint codebase using `biome check --write --unsafe`
bun run typecheck    # check for type errors using `tsgo -p tsconfig.json --noEmit`
bun run test         # run tests using `bun test`
bun run build        # build linux/mac/win binaries using `bun build --compile`
```

## Running individual tests (when debugging failures)

```bash
bun test tests/cli.test.ts
bun test --test-name-pattern "--help"
bun test tests/cli.test.ts --test-name-pattern "--version"
bun test --only-failures
```

## Expected behavior while fixing

If `bun run check` changes files, that is expected. Re-run it after fixes if needed.

When a step fails, fix the issue and re-run the smallest subset that proves it’s fixed (then continue).

Before reporting “done”, ensure all default verification steps pass.
