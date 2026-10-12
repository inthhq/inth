# c15t

Source: `@c15t/cli@3.0.0`, `src/generate` and `src/frontend` (https://github.com/c15t/c15t, Apache-2.0).

The files are unmodified. Refresh them with `node scripts/vendor-c15t.ts` after changing the version there and here. Scriptc compiles them statically into `inth c15t`; it does not compile the package's npm entry points.

inth supplies the account, organization, and project state that `frontend/index.ts` expects from a host. It uses `frontend/agent/prompt.ts` for agent prompts and `frontend/runtime` to plan, write, and install generated files.

`src/native/c15t-generation.ts` adapts the runtime's manual insert guidance for existing files. Version 3.0.0 lists all snippets when only some are missing; the host uses upstream's merge checks to recommend only missing snippets. The vendored runtime remains unchanged.

The same host adapter distinguishes missing environment keys from existing assignments. It recommends replacing a changed assignment or consolidating duplicates, preserves alternate Inth project URL variables, and never prints existing values.

`src/native/c15t-agent.ts` applies Inth's upgrade policy to exported and launched agent prompts. Existing c15t installations keep their current major unless the user explicitly requests an upgrade.

The host exports file metadata through `publicGenerationPlan`, keeping existing file contents internal. `src/native/c15t-html.ts` supports HTML sites without `package.json`, using upstream's generated snippets and recovery journal format with exclusive hard-link publication.

`src/native/c15t-next.ts` maps Next.js templates into the active root or `src` router directory and preserves the existing config filename. The host gives instructions for wrapping that config without changing its options, then uses upstream's planning, publication, recovery, and installation functions.

The Next.js adapter removes app stylesheet imports that the quickstarts do not generate, so entry points need no existing CSS file or `@` alias. Inth defaults auto-detected Astro projects to the `astro-static` template; the `astro` server target remains an explicit choice.
