---
description: Run quality gates in a dedicated subagent
agent: verify
---

Use the `check` skill and follow it exactly.

Workflow:

1. Run the checks in the recommended order.
2. If anything fails, fix the smallest possible thing to make it pass.
3. Re-run the failing step(s) until green.
4. At the end, report a concise summary:
   - which commands ran
   - what you changed (high level)
   - final status (pass/fail)
   - include `git diff --stat` and any important hunks
