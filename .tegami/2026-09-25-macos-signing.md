---
packages:
  "group:inth": patch
---

### Sign the macOS binary with a Developer ID

The Apple silicon binary is now signed with a Developer ID certificate and the hardened runtime. When you choose **Always Allow** at the Keychain prompt, the approval now carries over to later CLI updates instead of prompting again after each upgrade.
