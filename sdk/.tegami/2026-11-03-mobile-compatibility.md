---
packages:
  '@c15t/react-native': minor
---

### Add older and current React Native and Expo compatibility

Allow React Native 0.83 through 0.88 and React 19.2 through 19.3, including Expo
SDK 55 through 58 custom builds. Fix older React Native View ref and color scheme
types. The Expo plugin raises generated iOS deployment targets below 16.4 while
preserving higher app targets. iOS 16.4 and Android API 24 remain the native
minimums. The mobile SDK remains a private prerelease pending release acceptance.
