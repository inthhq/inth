---
packages:
  '@c15t/react-native': patch
---

### Build the iOS module in apps that link pods as frameworks

Apps that build CocoaPods as frameworks with `use_frameworks!` can now compile
`C15tReactNative`. React Native Firebase requires this setting, and so does
Expo's `useFrameworks`. The build previously stopped with
`'C15tReactNative-Swift.h' file not found`.
