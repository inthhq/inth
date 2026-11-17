/*
 C15tReactNative: the React Native binding for the c15t consent core.

 The public surface is the TurboModule, registered as `C15t` and implemented in Swift,
 plus `C15tReactNativeRuntime` for a host app that wants to start or install a core
 itself. CocoaPods host Swift code also uses the public C15tApple and C15tCore
 APIs compiled into this module, so the host and RN share one installed engine.
 */

#import <Foundation/Foundation.h>

FOUNDATION_EXPORT double C15tReactNativeVersionNumber;
FOUNDATION_EXPORT const unsigned char C15tReactNativeVersionString[];
