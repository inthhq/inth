/*
 InthReactNative: the React Native binding for the Inth consent core.

 The public surface is the TurboModule, registered as `Inth` and implemented in Swift,
 plus `InthReactNativeRuntime` for a host app that wants to start or install a core
 itself. CocoaPods host Swift code also uses the public InthApple and InthCore
 APIs compiled into this module, so the host and RN share one installed engine.
 */

#import <Foundation/Foundation.h>

FOUNDATION_EXPORT double InthReactNativeVersionNumber;
FOUNDATION_EXPORT const unsigned char InthReactNativeVersionString[];
