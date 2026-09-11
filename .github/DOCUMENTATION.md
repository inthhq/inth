# CLI documentation

Write public CLI docs in `docs/cli/*.mdx`. `docs/docs.config.ts` owns Leadtype navigation and product metadata. `docs/cli/meta.json` supplies the documentation folder order. Keep both navigation lists in sync when adding a page. The folder index is implicit in `meta.json`, so do not list `index` there.

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

## Release versions

Keep release status out of shared source pages. Use `inth --version` to identify the installed release and describe npm installation conditionally for published releases. Bundle docs from the same release commit as the product version.

## AEO and GEO authoring

Follow the [Mintlify GEO guide](https://www.mintlify.com/docs/guides/geo) when editing pages. Begin each page and section with the answer to the user's task. Use headings that name the task or question, consistent product and credential names, concrete commands, and exact limits supported by the code. Keep sections understandable when read separately. Explain what happens after the command and how to verify the result.

Every page needs a specific title and description. Use consecutive heading levels, language-tagged code fences, and descriptive image alt text. Leadtype treats violations of these structural GEO rules as errors. The source config adds every guide to `llms.txt`; navigation alone does not populate that file in this Leadtype version.

The package checker parses inline links and reference definitions as Markdown. Link-shaped examples in code blocks are not links. Package generation converts extensionless topic destinations to `.md`, including reference definitions, while preserving code and frontmatter.
