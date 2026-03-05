# term-serve docs-site

Astro Starlight site for user-facing `term-serve` usage and configuration docs.

## Local development

```bash
cd docs-site
bun install
bun run dev
```

## Build

```bash
cd docs-site
bun run build
bun run preview
```

## Deployment

Deployment is handled by `.github/workflows/docs-site.yml`:

- Trigger: push to `main` (and manual `workflow_dispatch`)
- Build output: `docs-site/dist`
- Target: GitHub Pages at `https://console-craft.github.io/term-serve/`

## Content layout

- Marketing splash page: `src/content/docs/index.mdx`
- User and power-user docs: `src/content/docs/**`
- Custom Gruvbox styling: `src/styles/gruvbox.css`
