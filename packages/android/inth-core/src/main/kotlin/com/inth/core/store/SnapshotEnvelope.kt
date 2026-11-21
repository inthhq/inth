package com.inth.core.store

import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.QueuedOptOut
import com.inth.core.model.QueuedSave
import com.inth.core.policy.EvaluationPolicy
import com.inth.core.policy.NoticeDismissal
import com.inth.core.tc.GlobalVendorList
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder

/**
 * What gets persisted under `com.inth.snapshot`.
 *
 * `packages/native-protocol/CONTRACT.md` calls the stored object a snapshot envelope, and this is
 * why: the [snapshot] keeps exactly the shape the React Native boundary reads,
 * while the inputs the mobile snapshot deliberately leaves out ride alongside it.
 * Without them a restart would forget the policy scope, the notice dismissal, and
 * the vendor list a disclosure was drawn from, and every launch would re-prompt.
 */
@Serializable
data class SnapshotEnvelope(
	val snapshot: ConsentSnapshot,
	@SerialName("lastIABActionAt") val lastIabActionAt: Long? = null,
	val additionalConsentList: com.inth.core.iab.AdditionalConsentList? = null,
	/** `/init`'s custom (non-IAB) vendors. Absent in an envelope written before they were kept, which reads as none. */
	val customVendors: List<com.inth.core.iab.IabCustomVendor>? = null,
	val iabListFetchedAt: Long? = null,
	val iabConsent: com.inth.core.iab.IabCommittedConsent? = null,
	val pendingSaves: List<@Serializable(with = EnvelopeQueuedSaveSerializer::class) QueuedSave>? = null,
	val pendingOptOuts: List<@Serializable(with = EnvelopeQueuedOptOutSerializer::class) QueuedOptOut>? = null,
	/** Whether this device has already queued a GPC opt-out request for the held opt-out record. Absent or `false` in an older envelope reads as not reported. */
	val optOutGpcReported: Boolean = false,
	val evaluationPolicy: EvaluationPolicy? = null,
	val noticeDismissal: NoticeDismissal? = null,
	/**
	 * The last vendor list the backend served, kept for the same reason and by the same rule as
	 * [evaluationPolicy], and the one place this build writes its bytes.
	 *
	 * Both are inputs the derived snapshot cannot carry -- one is the rule the receipts were judged
	 * against, the other is the document the purpose and vendor names in a disclosure come from -- and
	 * both have to outlive the `/init` that served them.
	 *
	 * The published snapshot does carry the list, at [com.inth.core.model.ConsentSnapshot.iab], because
	 * that is the key the React Native bridge reads and the key `core-swift` puts it on: a drawer that
	 * renders partner names has to reach the list the same way on both platforms. This key is the
	 * durable half of the same fact. [com.inth.core.ConsentCore] nulls the snapshot slot on the way in
	 * and refills it on hydration, so the encrypted blob holds one copy of a document that is by far
	 * the largest thing in it, written on every committed mutation, and a device that upgrades from a
	 * build that kept the list only here loses nothing: this is the key that build wrote, and it is
	 * still the key read first.
	 *
	 * Storage rules are therefore the envelope's and not a new set: the same encrypted slot, the same
	 * `InthJson.storage` codec, which refuses a document carrying a key this build does not model, and
	 * the same all-or-nothing consequence -- an unreadable envelope is nothing stored, and
	 * [com.inth.core.store.InthStore.clearConsentState] drops this key along with the receipts, which
	 * is right, because a wiped device is no longer showing anybody a disclosure.
	 *
	 * It is kept because losing it is not neutral. A device that drew purpose and vendor names off one
	 * list and relaunches without it either renders a disclosure with no names behind it or re-derives
	 * one from a `/init` that served no list, and either way the claim made to the subject changes
	 * without the subject doing anything. See [com.inth.core.ConsentCore.vendorList].
	 */
	val gvl: GlobalVendorList? = null,
	val bundledPolicyAuthority: com.inth.core.BundledPolicyAuthority? = null,
)

/** Keep queue compatibility separate from the envelope's strict consent authority. */
internal object EnvelopeQueuedSaveSerializer : KSerializer<QueuedSave> {
	override val descriptor = QueuedSave.serializer().descriptor
	override fun serialize(encoder: Encoder, value: QueuedSave) =
		QueuedSave.serializer().serialize(encoder, value)
	override fun deserialize(decoder: Decoder): QueuedSave {
		val input = decoder as? JsonDecoder ?: return QueuedSave.serializer().deserialize(decoder)
		return InthJson.queue.decodeFromJsonElement(QueuedSave.serializer(), input.decodeJsonElement())
	}
}

/** Keep opt-out queue compatibility separate from the envelope's strict consent authority. */
internal object EnvelopeQueuedOptOutSerializer : KSerializer<QueuedOptOut> {
	override val descriptor = QueuedOptOut.serializer().descriptor
	override fun serialize(encoder: Encoder, value: QueuedOptOut) =
		QueuedOptOut.serializer().serialize(encoder, value)
	override fun deserialize(decoder: Decoder): QueuedOptOut {
		val input = decoder as? JsonDecoder ?: return QueuedOptOut.serializer().deserialize(decoder)
		return InthJson.queue.decodeFromJsonElement(QueuedOptOut.serializer(), input.decodeJsonElement())
	}
}
