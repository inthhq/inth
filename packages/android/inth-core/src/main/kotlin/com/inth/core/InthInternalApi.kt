package com.inth.core

/**
 * Marks API that exists for Inth's own modules, tests and device fixtures.
 *
 * It covers the transport door: the types and entry points that let a caller choose
 * where consent records go. Apps configure Inth through `NativeConfig` and
 * `InthAndroid.install`, and do not need anything behind this marker. It can change or
 * go away in any release.
 */
@RequiresOptIn(
	level = RequiresOptIn.Level.ERROR,
	message = "This is internal Inth API for Inth's own modules and tests. " +
		"Apps set NativeConfig.backendUrl to their Inth project URL and call InthAndroid.install.",
)
@Retention(AnnotationRetention.BINARY)
@Target(
	AnnotationTarget.CLASS,
	AnnotationTarget.FUNCTION,
	AnnotationTarget.CONSTRUCTOR,
	AnnotationTarget.PROPERTY,
)
annotation class InthInternalApi
