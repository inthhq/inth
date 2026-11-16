package com.c15t.core

/**
 * Marks API that exists for c15t's own modules, tests and device fixtures.
 *
 * It covers the transport door: the types and entry points that let a caller choose
 * where consent records go. Apps configure c15t through `NativeConfig` and
 * `C15tAndroid.install`, and do not need anything behind this marker. It can change or
 * go away in any release.
 */
@RequiresOptIn(
	level = RequiresOptIn.Level.ERROR,
	message = "This is internal c15t API for c15t's own modules and tests. " +
		"Apps set NativeConfig.backendUrl to their Inth project URL and call C15tAndroid.install.",
)
@Retention(AnnotationRetention.BINARY)
@Target(
	AnnotationTarget.CLASS,
	AnnotationTarget.FUNCTION,
	AnnotationTarget.CONSTRUCTOR,
	AnnotationTarget.PROPERTY,
)
annotation class C15tInternalApi
