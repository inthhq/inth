package com.c15t.core.transport

import com.c15t.core.model.ConsentSubject
import com.c15t.core.model.KernelUser
import com.c15t.core.model.QueuedSave

/**
 * The transport for no-backend mode, the Android twin of Swift's `OfflineTransport`.
 *
 * Every command fails as `offline`. Consent still applies and persists on the device,
 * `/init` never answers, and the policy comes from the app's own configuration.
 */
object OfflineTransport : C15tTransport {
	private const val REASON = "offline"

	override fun init(context: InitContext): TransportOutcome = TransportOutcome.NetworkFailure(REASON)

	override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable(REASON)

	override fun identify(subject: ConsentSubject, user: KernelUser): TransportOutcome =
		TransportOutcome.NetworkFailure(REASON)

	override fun logout(subject: ConsentSubject): TransportOutcome = TransportOutcome.NetworkFailure(REASON)
}
