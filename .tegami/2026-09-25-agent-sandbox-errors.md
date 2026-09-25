---
packages:
  "group:inth": patch
---

### Explain failures inside Cursor's agent sandbox

When Cursor's sandbox blocks the CLI state directory, the system credential store, or the Inth API, the CLI now returns the `sandbox_restricted` error code. The message names the likely block and asks you to run the command outside the sandbox. The install docs also explain how to install from a sandboxed agent terminal, including npm's misleading report of a root-owned cache.
