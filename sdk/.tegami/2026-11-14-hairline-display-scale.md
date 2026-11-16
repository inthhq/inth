---
packages:
  '@c15t/react-native': patch
---

### Native consent dividers follow the screen they are on

The iOS consent screens draw their divider hairline from the view's display
scale instead of `UIScreen.main`, which iOS 26 deprecates. On an external
display it is now one pixel of that display.
