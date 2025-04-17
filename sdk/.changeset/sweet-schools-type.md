---
"@c15t/cli": patch
"c15t": patch
---

# Removal of localstorage option in offline and custom

- **Documentation**
  - Updated offline mode documentation to remove references to the `localStorageKey` configuration option.
- **Bug Fixes**
  - Removed the ability to customize the localStorage key for storing consent data; a fixed key is now always used.
- **Refactor**
  - Streamlined internal handling of localStorage keys by removing related configuration options and parameters.
- **Tests**
  - Updated and removed tests related to custom localStorage key usage.
