/*
 * The Objective-C++ half of the `Inth` TurboModule.
 *
 * Codegen generates the protocol, the JSI glue, and the method metadata. The generated
 * `RCTModuleProviders` in the host app maps the JavaScript name `Inth` onto this class by
 * looking the class name up at runtime. Two things are left undone, and both have to be
 * done in this file rather than in Swift:
 *
 * 1. `RCTTurboModuleManager` only creates and sets up a module whose class conforms to
 *    `@protocol(RCTTurboModule)`. Without that conformance it never wires
 *    `callableJSModules`, so `sendEventWithName` has nowhere to go. `NativeInthSpec`
 *    inherits from `RCTTurboModule`, and no Swift file can name it: the generated
 *    umbrella header refuses to compile as plain Objective-C.
 * 2. `RCTModuleProviders` instantiates the class and then requires
 *    `respondsToSelector:@selector(getTurboModule:)` before it keeps the instance. That
 *    method returns a `std::shared_ptr`, which has no Swift spelling, and
 *    `RCT_EXTERN_REMAP_MODULE` does not synthesise it.
 *
 * The Swift class stays the implementation. Nothing here decides anything about consent,
 * and nothing here repeats a method signature: the JSI wrapper is the generated
 * `NativeInthSpecJSI`, and it dispatches to the selectors the Swift class exposes.
 *
 * The import names the subdirectory. `codegenConfig.name` is `InthSpec`, and the
 * generated `ReactCodegen.podspec` keeps `header_mappings_dir` at `./`, so the protocol
 * is installed at `Pods/Headers/Public/ReactCodegen/InthSpec/InthSpec.h` rather than at
 * a flat `NativeInthSpec.h`.
 */

#import <objc/runtime.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTLog.h>

// Module-qualified, with the subdirectory: see the note above about
// `header_mappings_dir`.
#import <ReactCodegen/InthSpec/InthSpec.h>

// Last, because it declares a class whose superclass and block types come from the two
// headers above.
// Pods built as frameworks (`use_frameworks!`, which React Native Firebase and Expo's
// useFrameworks require) expose the Swift interface under the module name; static
// libraries expose it as a plain header.
#if __has_include(<InthReactNative/InthReactNative-Swift.h>)
#import <InthReactNative/InthReactNative-Swift.h>
#else
#import "InthReactNative-Swift.h"
#endif

/*
 * The conformance and the JavaScript name, both of which have to live in ObjC++.
 *
 * `NativeInthSpec` inherits `RCTTurboModule`, which is what makes
 * `RCTTurboModuleManager` create this class, wire its `callableJSModules`, and call
 * `getTurboModule:`. The protocol list belongs on the category interface: an
 * `@implementation` cannot carry one. Declaring the conformance is also what makes the
 * compiler check every signature written below against the generated protocol.
 *
 * `RCT_EXTERN_REMAP_MODULE` is not usable here. It expands to a fresh
 * `@interface InthReactNativeModule : RCTEventEmitter`, and the Swift generated header
 * already defines that class, so the macro is a duplicate interface definition. All the
 * macro was needed for is the JavaScript name, and `+moduleName` answers that directly.
 * The generated `RCTModuleProviders` finds the class by name and the New Architecture
 * builds it through the provider, so no legacy bridge registration is needed.
 */
@interface InthReactNativeModule (InthTurboModule) <NativeInthSpec>

+ (NSString *)moduleName;

@end

/// Strip the parts of an Objective-C type encoding that differ between a protocol
/// declaration and an implementation for reasons that are not the signature: the class
/// name written after an `@`, and the byte offset recorded after each argument.
static NSString *InthNormalizeTypeEncoding(const char *encoding) {
    if (encoding == NULL) {
        return nil;
    }

    NSString *raw = [NSString stringWithUTF8String:encoding];
    NSMutableString *normalized = [NSMutableString string];
    BOOL insideClassName = NO;

    for (NSUInteger i = 0; i < raw.length; i++) {
        unichar character = [raw characterAtIndex:i];
        if (character == '"') {
            insideClassName = !insideClassName;
            continue;
        }
        if (insideClassName || (character >= '0' && character <= '9')) {
            continue;
        }
        [normalized appendFormat:@"%C", character];
    }

    return [normalized copy];
}

@implementation InthReactNativeModule (InthTurboModule)

+ (NSString *)moduleName {
    return @"Inth";
}


// Compare this class against the generated protocol, once per process.
//
// The list comes from `@protocol(NativeInthSpec)` itself rather than from a copy of it
// written here, so a method Codegen renames or retypes is reported by name the moment
// the module is built. Left unchecked that drift arrives as an unrecognized selector
// inside `invokeObjCMethod` on the JavaScript thread, which is the worst place in this
// binding for a mistake to surface.
- (void)inthCheckAgainstGeneratedSpec {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        unsigned int methodCount = 0;
        struct objc_method_description *methods = protocol_copyMethodDescriptionList(@protocol(NativeInthSpec), YES, YES, &methodCount);

        if (methods == NULL) {
            RCTLogError(@"Inth: the generated NativeInthSpec protocol reported no methods, so the TurboModule cannot be built.");
            return;
        }

        for (unsigned int index = 0; index < methodCount; index++) {
            SEL selector = methods[index].name;
            if (selector == NULL) {
                continue;
            }

            Method implemented = class_getInstanceMethod([self class], selector);
            if (implemented == NULL) {
                RCTLogError(@"Inth: %@ does not respond to %@, so the generated JSI glue cannot call it.", NSStringFromClass([self class]), NSStringFromSelector(selector));
                continue;
            }

            NSString *declared = InthNormalizeTypeEncoding(methods[index].types);
            if (declared == nil) {
                continue;
            }

            NSString *actual = InthNormalizeTypeEncoding(method_getTypeEncoding(implemented));
            if (![declared isEqualToString:actual]) {
                RCTLogError(@"Inth: %@ implements %@ as %@ but the generated protocol declares %@.", NSStringFromClass([self class]), NSStringFromSelector(selector), actual, declared);
            }
        }

        free(methods);
    });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
    [self inthCheckAgainstGeneratedSpec];

    // The generated wrapper owns nothing but the reference in `params.instance`, which
    // is the same Swift object RN just created and set up, so the JSI method map calls
    // straight into it.
    return std::make_shared<facebook::react::NativeInthSpecJSI>(params);
}

@end
