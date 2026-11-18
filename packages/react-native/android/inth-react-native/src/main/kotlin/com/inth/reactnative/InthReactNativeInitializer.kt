package com.inth.reactnative

import android.content.Context
import androidx.startup.Initializer

/**
 * Starts Inth before the first Activity exists, and so before the React host.
 *
 * A `ContentProvider` is installed during `Application.onCreate`, which is earlier
 * than any JavaScript, and the core's hydration work is synchronous inside that
 * window. That ordering is what lets the first frame read a stored consent answer
 * rather than wait on a network round trip.
 *
 * An app that bootstraps Inth itself removes this with `tools:node="remove"` on the
 * provider entry, or sets `com.inth.reactnative.AUTO_BOOTSTRAP` to `false`.
 */
class InthReactNativeInitializer : Initializer<Unit> {
	override fun create(context: Context) {
		InthReactNativeBootstrap.ensure(context.applicationContext)
	}

	/**
	 * No declared dependencies.
	 *
	 * The pure Android library registers its own initializer, and either one winning
	 * is correct: both install the same core with the same manifest configuration, and
	 * a second install is ignored.
	 */
	override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}
