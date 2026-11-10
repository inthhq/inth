---
packages:
  'swift:c15t-swift': patch
---

### Do less work when the iOS consent banner first appears

The first consent screen no longer builds a navigation stack. The stack is
created when preferences or a partner page opens. Parts of the screen that are
not shown are no longer set up in advance.

Theme colours are reused between reads, and the presenter only announces a
change when a value differs. The `IABTCF_` keys in `UserDefaults` are not
rewritten when they already hold the same values.
