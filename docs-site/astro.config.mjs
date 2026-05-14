// @ts-check

import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

const REPO_NAME = "term-serve"
const isGitHubActions = process.env.GITHUB_ACTIONS === "true"
const basePath = isGitHubActions ? `/${REPO_NAME}` : ""

// https://astro.build/config
export default defineConfig({
  site: "https://console-craft.github.io",
  base: isGitHubActions ? `/${REPO_NAME}` : "/",
  integrations: [
    starlight({
      title: "term-serve",
      description: "Serve a local terminal in the browser (WebSocket + PTY).",
      tagline: "A browser terminal with real shell power.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/console-craft/term-serve" }],
      editLink: {
        baseUrl: "https://github.com/console-craft/term-serve/edit/main/docs-site/",
      },
      head: [
        { tag: "link", attrs: { rel: "icon", type: "image/png", href: `${basePath}/favicon.png` } },
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap",
          },
        },
      ],
      customCss: ["./src/styles/gruvbox.css"],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Getting Started", slug: "getting-started" },
            { label: "Usage Patterns", slug: "usage" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Configuration File", slug: "configuration" },
            { label: "Themes and Fonts", slug: "themes-and-fonts" },
            { label: "Security and Networking", slug: "security" },
          ],
        },
        {
          label: "Operations",
          items: [{ label: "Run as a systemd Service", slug: "operations/systemd" }],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Flags", slug: "reference/cli-flags" },
            { label: "Config Schema", slug: "reference/config-reference" },
          ],
        },
      ],
    }),
  ],
})
