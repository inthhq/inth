# c15t

Source: `@c15t/cli@3.0.0-alpha.4`, `src/generate` and `src/frontend` (https://github.com/c15t/c15t, Apache-2.0).

The files are unmodified. Refresh them with `node scripts/vendor-c15t.ts` after changing the version there and here. Scriptc compiles them statically into `inth c15t`; it does not compile the package's npm entry points.

inth supplies the account, organization, and project state that `frontend/index.ts` expects from a host. It uses `frontend/agent/prompt.ts` for agent prompts and `frontend/runtime` to plan, write, and install generated files.
