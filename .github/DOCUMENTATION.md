# CLI documentation

Write public CLI docs in `docs/cli/*.mdx`. `docs/docs.config.ts` owns Leadtype navigation and product metadata. `docs/cli/meta.json` supplies the folder order for the monorepo's existing docs loader. Keep both navigation lists in sync when adding a page. The folder index is implicit in `meta.json`, so do not list `index` there.

This repository owns the content and package bundle. `inthhq/monorepo` owns the web app at `inth.com/docs/cli`.

## Check and bundle

```sh
pnpm docs:lint
pnpm docs:bundle
pnpm docs:check
```

`docs:lint` uses pinned Leadtype with strict frontmatter, link, anchor, snippet, and navigation checks. Warnings fail the check. External URL probing is excluded from the merge gate.

`docs:bundle` generates `packages/cli/AGENTS.md`, `SKILL.md`, and `docs/cli/*.md`. It fixes local page links to point at Markdown files. It removes stale generated topics and preserves the existing authored guides directly under `packages/cli/docs`. Generated files are ignored by git; edit the MDX sources instead.

`docs:check` also packs `@inth/cli` and checks that the archive contains the index, skill, every current topic, and working local links. It needs no native compiler. `pnpm check` includes this check. CI runs the docs job for pull requests, main pushes, manual runs, and the reusable release workflow.

## Package distribution

Ship the bundle with both the npm launcher and platform packages. It is small text content and gives agents documentation for the version they installed. The native executable does not embed these files or need Leadtype at runtime.

The launcher's `prepack` script regenerates the bundle. Native packaging generates it before copying docs into the platform archive. The release job generates it explicitly too, before Tegami publishes packages. Native package verification checks the bundled topics after extraction and after installing the launcher.

Agents can start at `node_modules/@inth/cli/AGENTS.md`. A global installation stores the same file under the package directory reported by `npm root -g`. CLI `--help --json` remains the installed command contract, including flags, scopes, and effects.

The longer authentication and c15t integration guides in `packages/cli/docs` remain available. Public task guides belong in `docs/cli`; build experiments and backend integration notes belong in the existing repository guides.

## Import into the current monorepo app

The app lives in `docs/public`, but its current pipeline and page loader read authored pages from `docs/inth`. To use that setup:

1. Copy this repository's `docs/cli` directory into `docs/inth/cli` at a chosen release commit. Include `meta.json`.
2. Add `cli` to the `pages` array in `docs/inth/meta.json`.
3. Run the app's `prepare:docs` script and build it. The existing Markdown, search, and agent artifact generation will include the imported pages.

The index becomes `/docs/cli`, and the other pages become `/docs/cli/<slug>`. The files use standard Markdown inside MDX and relative page links. They require no custom components or separate site. Record the imported commit in the monorepo so later updates use a known source revision.

The current guides describe the unpublished development package. Update the installation status when the first release becomes available, before promoting those docs to production.

## Import through a Leadtype collection

The c15t docs app instead uses a remote collection with a pinned commit and `sourceConfig: true`. If the Inth app adopts that loader, add this collection to its config:

```ts
import { defineCollection } from "leadtype";

const cli = defineCollection({
  repository: "https://github.com/inthhq/inth.git",
  ref: "<release-commit-sha>",
  cacheDir: ".leadtype/inth-cli",
  dir: "docs",
  prefix: "/docs",
  sourceConfig: true,
});
```

Use `dir: "docs"` and `prefix: "/docs"`. The source already contains the `cli` directory, so a `/docs/cli` prefix would duplicate that segment. The source config lives at `docs/docs.config.ts` and supplies navigation. Run `leadtype sync` before generating in a fresh checkout, and make the web page loader read the same collection. Adding a collection to artifact generation alone does not change the app's current `docs/inth` page loader.

The host owns its product identity, remote revision, output paths, and deployment. Promote a release by updating the pinned commit in a monorepo PR. This repo does not dispatch cross-repository updates or deploy the docs app.

See Leadtype's [cross-repository guide](https://leadtype.dev/docs/pipeline/sync-docs-across-repos) and [package bundle guide](https://leadtype.dev/docs/package-docs/bundle).
