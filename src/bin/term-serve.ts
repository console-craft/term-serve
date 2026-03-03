#!/usr/bin/env bun

// Shim entrypoint for running the CLI from source. Usage: ./src/bin/term-serve.ts [options] [command [args...]]

import { run } from "@/cli"

run(Bun.argv)
