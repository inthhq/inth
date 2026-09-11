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

`docs:check` also packs `@inth/cli` and checks that the archive contains the index, skill, every current topic, and working local links. The same check generates web artifacts in a temporary directory and verifies every guide in the LLM index, full-context file, search, sitemap, and canonical metadata. It needs no native compiler. `pnpm check` includes this check. CI runs the docs job for pull requests, main pushes, manual runs, and the reusable release workflow.

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

Keep release status out of shared source pages. Use `inth --version` to identify the installed release and describe npm installation conditionally for published releases. Promote docs from the same release commit as the product version.

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

## AEO and GEO authoring

Follow the [Mintlify GEO guide](https://www.mintlify.com/docs/guides/geo) when editing pages. Begin each page and section with the answer to the user's task. Use headings that name the task or question, consistent product and credential names, concrete commands, and exact limits supported by the code. Keep sections understandable when read separately. Explain what happens after the command and how to verify the result.

Every page needs a specific title and description. Use consecutive heading levels, language-tagged code fences, and descriptive image alt text. Leadtype treats violations of these structural GEO rules as errors. The source config adds every guide to `llms.txt`; navigation alone does not populate that file in this Leadtype version.

The package checker parses inline links and reference definitions as Markdown. Link-shaped examples in code blocks are not links. Package generation converts extensionless topic destinations to `.md`, including reference definitions, while preserving code and frontmatter.

## Verify discovery after the monorepo import

The source and build checks cannot establish how the live host serves or indexes these pages. Before deploying the import:

- Check that `/docs/cli` and every guide render as public HTML with the correct title, description, and canonical URL.
- Include CLI guides in the host's `llms.txt`, full-context file, search index, sitemap, and agent-readability metadata. Preserve the host's existing product guides when merging these artifacts.
- Serve each Markdown URL declared by the metadata, including the index alias `/docs/cli.md`. Leadtype writes the source index mirror to `docs/cli/index.md`; the host must resolve the public alias.
- Check the deployed robots and indexing settings for unintended restrictions on public docs or search and user-requested retrieval agents. Choose training policy separately from search access.
- Keep dates and authors tied to source history. Do not invent freshness metadata or claim that optimization guarantees citations.

After deployment, try questions such as "How do I authenticate the Inth CLI in CI?", "How do I disable Inth CLI telemetry?", and "How do I update an Inbox finding?" Check the cited URL, command, credential requirements, and limits against the deployed docs. These manual checks evaluate answer accuracy; local structural checks do not measure answer-engine rankings.
