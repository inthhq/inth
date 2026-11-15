---
packages:
  'swift:c15t-swift': patch
---

### Consent screen dividers follow the screen they are on

The divider hairline in `C15tConsentUI` takes its width from the view's
display scale instead of `UIScreen.main`, which iOS 26 deprecates. On an
external display it is now one pixel of that display.
