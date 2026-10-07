---
packages:
  "group:inth": patch
---

### Include the installation ID and install method in usage events

Usage events now include the random installation ID as `installation_id`, including events from signed-in users, so installations can be counted separately from people. Signed-in events still use the Inth user ID as their identity, and the installation ID is now linked to it.

Events also include `install_method`, the same check `inth update` uses to choose how to update: `standalone` for the install script's executable, a package manager for global installations, `temporary` for `npx`, `pnpm dlx`, or `bunx`, or `project` for a project dependency.
