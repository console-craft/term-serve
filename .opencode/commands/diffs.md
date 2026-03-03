---
description: Generate HTML previews for untracked files and unstaged diffs in /tmp (clickable links)
agent: diffs
---

Use the `diffs` skill and follow it exactly.

Workflow:

1. Render untracked files using `code2html` into `/tmp/opencode-diffs/` with UUID filenames.
2. Render unstaged changes using `diff2html` (index vs working tree) into `/tmp/opencode-diffs/` with UUID filenames.
3. Print links as a tree using `paths2tree`.
   - Input to `paths2tree`: `<relative/path><TAB>file:///tmp/opencode-diffs/<output>.html`
   - This preserves the per-file mapping: `<relative/path/to/source> -> file:///tmp/opencode-diffs/<output>.html`
   - The main agent should always print the tree output generate by this subagent, NOT a summary.
