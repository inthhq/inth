package com.inth.android

import android.content.Context
import androidx.startup.Initializer

/**
 * Starts Inth before the first Activity exists.
 *
 * The core's own [com.inth.core.ConsentCore.bootstrap] is idempotent and does its
 * network work on a worker thread, so this adds nothing measurable to launch time
 * while guaranteeing that an ad SDK initialised during `Application.onCreate`
 * already gets a real answer from [com.inth.core.Inth.isAllowed].
 *
 * A host that configures Inth itself can drop this with
 * `tools:node="remove"` on the provider entry in its manifest.
 */
class InthInitializer : Initializer<Unit> {
	override fun create(context: Context) {
		InthAndroid.bootstrap(context)
	}

	override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}
