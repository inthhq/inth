---
packages:
  '@c15t/react-native': patch
---

### Show the expanded tracking prompt on iOS 27.2

Apple renamed the expanded App Tracking Transparency request before iOS and
iPadOS 27.2 shipped. The SDK looked for the beta name, did not find it, and fell
back to the plain request. Apps in the European Union lost the Additional
Information button, and outside Germany, France, Italy, Poland and Romania they
got the standard alert in place of the full-page prompt. The SDK now calls the
released method.
