---
name: diffs
description: Generate clickable HTML previews for new (untracked) files and unstaged diffs using code2html/diff2html, via the diffs subagent.
---

## Important

This skill should always be run using the `diffs` subagent.

## Purpose

When the agent has changed files, this skill produces HTML output in `/tmp` so the user can review:

- ✅ **New, untracked files** → highlighted with `code2html`
- ✅ **Unstaged changes** → rendered with `diff2html` (index vs working tree)

The subagent will print links like:

Printed as a tree using `paths2tree`, with the URL as the label.

Example output:

```text
src
|-- cli.ts -> file:///tmp/opencode-diffs/CHANGED-path-to-cli.ts-<uuid>.html
`-- lib
    `-- tree.ts (new) -> file:///tmp/opencode-diffs/NEW-path-to-tree.ts-<uuid>.html
```

## Default workflow (run in order)

### 1) Generate HTML outputs for

#### A) Untracked files (new files not yet in git)

Use `git ls-files --others --exclude-standard` and render each file via:

```bash
code2html "<file>" > "<out.html>"
```

#### B) Unstaged changes (working tree vs index)

Use `git diff --name-status` and for each modified file (skip deletions), render via:

```bash
diff2html <(git show :"<file>") "<file>" > "<out.html>"
```

### 2) Output directory + naming

Write into: `/tmp/opencode-diffs`

Output filenames must include a UUID to avoid overwriting.

Recommended pattern:

- New file highlight: `NEW-<path>-<basename>-<uuid>.html`
- Unstaged diff: `CHANGED-<path>-<basename>-<uuid>.html`

### 3) Report results

Collect all generated outputs and print them in a tree using `paths2tree`.

Input format to `paths2tree`:

- one item per line
- `<relative-path-to-source-file><TAB>file:///tmp/opencode-diffs/<output-file>.html`

The last part (after the TAB) is the label, and must be the URL.

Individual link semantics must remain:

`<relative-path-to-source-file> -> file:///tmp/opencode-diffs/<output-file>.html`

When rendered as a tree, `paths2tree` shows directories as the path prefix and the leaf line shows the basename plus the URL label.

The main agent should always print the tree output generate by this subagent, NOT a summary.
