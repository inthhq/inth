package com.inth.core.store

import com.inth.core.model.covers
import com.inth.core.model.isWithdrawal
import com.inth.core.model.sameOwner

import com.inth.core.SubjectIdGenerator
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.QueuedSave
import com.inth.core.spi.KeyValueStore
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.Json

/**
 * Storage keys shared by every Inth native core.
 *
 * The names match the iOS Keychain item keys in `packages/native-protocol/CONTRACT.md` so a
 * cross-platform reader can address the same slots.
 */
object InthStoreKeys {
	const val SNAPSHOT = "com.inth.snapshot"
	const val SUBJECT = "com.inth.subject"
	const val PENDING = "com.inth.pending"
}

/**
 * A stored subject id that this build cannot use, reported by the read that refused it.
 *
 * It travels as a value rather than as a log line because the caller has a decision to
 * make with it: the records written under this id are keyed to a subject the producer
 * will not answer a query for, so they go with it. [legacyUuidShape] is what lets the
 * host tell an install written by a prerelease build apart from a store somebody
 * corrupted, which are two different things to explain to a user.
 */
data class UnusableSubjectId(
	val id: String,
	val legacyUuidShape: Boolean,
)

/**
 * Typed persistence over a host [KeyValueStore].
 *
 * Every read is fail-closed: anything this build cannot parse comes back as
 * `null`, and the caller serves the deny-all snapshot. That covers a payload
 * written by a newer build, a truncated write, and a tampered or decrypted-to-
 * garbage blob from the encryption layer.
 */
class InthStore(
	private val backend: KeyValueStore,
	private val json: Json = InthJson.storage,
	/**
	 * Codec for the offline queue alone. It tolerates unknown keys, which is the opposite
	 * of [json]; see [InthJson.queue] for why that asymmetry is on purpose.
	 */
	private val queueJson: Json = InthJson.queue,
	private val onReadFailure: (String, Throwable) -> Unit = { _, _ -> },
	/**
	 * Where the `IABTCF_*` bus lands, or `null` to write no bus at all.
	 *
	 * The bus is an egress projection of committed state, never a second
	 * consent store: nothing here reads it back. A host wires the
	 * application-default SharedPreferences conformance described on
	 * [TcStorageBusSink]; a host that ships no ad SDK passes `null` and the
	 * store's behaviour is byte-identical to a build with no bus at all.
	 */
	private val tcStorageBus: TcStorageBusSink? = null,
) {
	private var busConfiguration: com.inth.core.iab.IabConfiguration? = null

	/** Signal the explicitly configured CMP before reading records or starting network work. */
	@Synchronized
	fun initializeTcStorageBus(configuration: com.inth.core.iab.IabConfiguration?) {
		busConfiguration = configuration
		publishTcStorageBus(null)
	}

	/** Only the core may supply a live, validated authority for a repair publication. */
	@Synchronized
	internal fun publishTcStorageBus(envelope: SnapshotEnvelope?, gpp: Map<String, TcBusValue> = emptyMap()) {
		val bus = tcStorageBus ?: return
		try {
			val values = if (envelope == null) TcStorageBusProjection.detection(busConfiguration)
				else TcStorageBusProjection.values(envelope, busConfiguration) + gpp
			if (values.isEmpty()) bus.clear() else bus.write(values)
		} catch (_: Exception) {
			try { bus.clear() } catch (_: Exception) { /* Next publication retries. */ }
		}
	}

	/**
	 * Set by the read that refused a stored id, cleared when [takeUnusableSubject] hands it
	 * over. Guarded by the instance rather than by a process flag because a host that runs
	 * two stores gets two honest reads, and neither one should silence the other.
	 */
	private var unusableSubject: UnusableSubjectId? = null
	var subjectReplacementReason: String? = null
		private set

	fun hasConsentRecords(): Boolean =
		listOf(InthStoreKeys.SNAPSHOT, InthStoreKeys.PENDING).any { key ->
			readRaw(key).fold(onSuccess = { it != null }, onFailure = { true })
		}

	/**
	 * Read the stored subject, or `null` when absent, unparseable, or unusable.
	 *
	 * Unusable is the read-side half of the format rule: a stored id that is neither a
	 * lowercase UUIDv7 nor a c15t `sub_` id (the `read` cases in
	 * `packages/native-protocol/subject-id/uuidv7.json`) is not an identity the backend
	 * takes, so it is not one this build can answer with. Such an id reads as absent and is
	 * left in [takeUnusableSubject] for whoever is going to say so out loud.
	 *
	 * The stored value is not rewritten here. Dropping the identity is a decision with a
	 * snapshot and a queue attached to it, and a store that quietly repaired an id would
	 * make that decision invisible.
	 */
	fun readSubject(): ConsentSubject? {
		unusableSubject = null
		subjectReplacementReason = null
		val raw = readRaw(InthStoreKeys.SUBJECT).getOrElse {
			subjectReplacementReason = "corrupt"
			return null
		}
		val stored = tryDecode(InthStoreKeys.SUBJECT, ConsentSubject.serializer(), raw = raw)
		if (stored == null) {
			subjectReplacementReason = if (raw == null) "missing" else "corrupt"
			return null
		}
		if (SubjectIdGenerator.isValid(stored.id)) {
			return stored
		}
		unusableSubject = UnusableSubjectId(
			id = stored.id,
			legacyUuidShape = SubjectIdGenerator.isLegacyUuidShape(stored.id),
		)
		return null
	}

	/**
	 * Take the id the most recent [readSubject] refused, and clear it.
	 *
	 * Consuming it is what makes "announce this once per launch" fall out of the read
	 * instead of a counter somebody has to remember to reset: a second read of the same
	 * identity has nothing left to report.
	 */
	fun takeUnusableSubject(): UnusableSubjectId? = unusableSubject.also { unusableSubject = null }

	/**
	 * The refused id standing unannounced, without consuming it.
	 *
	 * [readEnvelope] consults this so the rule does not depend on which of the two reads
	 * a caller happens to do first: an envelope whose identity has already been refused is
	 * unreadable either way.
	 */
	val hasUnusableSubject: Boolean
		get() = unusableSubject != null

	/** Persist [subject]. */
	fun writeSubject(subject: ConsentSubject) {
		backend.write(InthStoreKeys.SUBJECT, json.encodeToString(ConsentSubject.serializer(), subject))
	}

	/** Write the identity slot and report whether it reached durable storage. */
	fun writeSubjectDurably(subject: ConsentSubject): Boolean = try {
		backend.writeDurably(InthStoreKeys.SUBJECT, json.encodeToString(ConsentSubject.serializer(), subject))
	} catch (_: Exception) {
		false
	}

	/**
	 * Read the stored envelope, or `null` when absent or unparseable.
	 *
	 * Unparseable covers a truncated write, a payload from a newer build, a document
	 * from another codec, and anything carrying a key this build does not model --
	 * [RetiredWireFields] names the retired ones, and the storage codec refuses any
	 * other unknown key rather than dropping it on the next write. Either way a read
	 * failure is deny-all, and the device answers exactly as it would with an empty
	 * slot. An unreadable envelope costs the records and not the identity, because the
	 * subject id lives under its own key.
	 *
	 * The other direction is the one that needs saying: the records are attributed to that
	 * subject, so an identity [readSubject] refused makes this envelope unreadable too.
	 * Restoring it under a replacement id would credit a decision to a subject that never
	 * made it, and the next launch would keep that credit under a name the old records
	 * were never filed under.
	 */
	fun readEnvelope(): SnapshotEnvelope? {
		if (hasUnusableSubject) {
			return null
		}
		return tryDecode(InthStoreKeys.SNAPSHOT, SnapshotEnvelope.serializer()) { raw ->
			RetiredWireFields.assertReadable(json, raw)
			RetiredWireFields.withoutDroppedFields(json, raw)
		}
	}

	/** Persist a newer envelope before publishing its vendor mirror. Custom backends must
	 * explicitly acknowledge durable writes. Mirror failure never rolls back authority. */
	fun writeEnvelope(envelope: SnapshotEnvelope): Boolean = writeEnvelope(envelope, publishBus = true)

	@Synchronized
	internal fun writeEnvelope(envelope: SnapshotEnvelope, publishBus: Boolean, dropPending: Boolean = false): Boolean {
		val old = readEnvelope()
		if (old != null && old.snapshot.revision > envelope.snapshot.revision) return false
		// A dry-run save empties the queue in the same write as the decision.
		val next = envelope.copy(pendingSaves = if (dropPending) emptyList() else old?.pendingSaves)
		return writeAtomic(next, publishBus)
	}

	/**
	 * Persist the decision and its delivery obligation before publishing either.
	 * IAB decisions supersede grants; category decisions retain their queue history.
	 */
	fun commit(
		envelope: SnapshotEnvelope,
		entry: QueuedSave,
		limit: Int = PendingSaveQueue.DEFAULT_LIMIT,
		supersedeGrants: Boolean = true,
	): Boolean = commit(envelope, entry, limit, supersedeGrants, publishBus = true)

	@Synchronized
	internal fun commit(
		envelope: SnapshotEnvelope,
		entry: QueuedSave,
		limit: Int,
		supersedeGrants: Boolean,
		publishBus: Boolean,
	): Boolean {
		val capacity = limit.coerceIn(1, PendingSaveQueue.DEFAULT_LIMIT)
		val current = readPending().filterNot { entry.isWithdrawal() && it.sameOwner(entry) && entry.covers(it) }
		val withdrawals = current.filter { it.isWithdrawal() }
		if (withdrawals.size >= capacity) return false
		val grants = if (supersedeGrants) emptyList() else
			current.filterNot { it.isWithdrawal() }.takeLast(capacity - withdrawals.size - 1)
		return writeAtomic(envelope.copy(pendingSaves = withdrawals + grants + entry), publishBus)
	}

	/** Atomic empty consent state for reset and identity changes. */
	@Synchronized
	fun replace(envelope: SnapshotEnvelope): Boolean =
		writeAtomic(envelope.copy(pendingSaves = readPending().filter { it.isWithdrawal() }))

	private fun writeAtomic(envelope: SnapshotEnvelope, publishBus: Boolean = true): Boolean {
		val raw = json.encodeToString(SnapshotEnvelope.serializer(), envelope)
		val written =
			try {
				backend.writeDurably(InthStoreKeys.SNAPSHOT, raw)
			} catch (_: Exception) {
				false
			}
		if (!written) {
			if (publishBus && envelope.iabConsent == null) publishTcStorageBus(null)
			return false
		}
		if (publishBus) publishTcStorageBus(envelope)
		return true
	}

	/** Read the offline write queue; an unparseable queue reads as empty. */
	@Synchronized
	fun readPending(): List<QueuedSave> {
		val envelope = readEnvelope()
		val snapshot = readRaw(InthStoreKeys.SNAPSHOT).getOrElse { return emptyList() }
		if (snapshot != null && envelope == null) return emptyList()
		return envelope?.pendingSaves
			?: tryDecode(InthStoreKeys.PENDING, PendingQueue.serializer(), queueJson)?.entries ?: emptyList()
	}

	/**
	 * Replace the whole offline write queue, and report whether the bytes came back.
	 *
	 * The read-back is the only durability signal this seam offers. [KeyValueStore.write]
	 * returns `Unit`, and a host store is allowed to swallow a failed write rather than
	 * throw out of a launch hook -- [ResilientKeyValueStore] does exactly that once it has
	 * given up on its key. Without the read-back, a caller above cannot tell a queue that
	 * wrote from a queue that quietly did not, which is the difference between a save that
	 * owes delivery and a save that only believes it does.
	 *
	 * Comparison is on the plaintext that went in, not on the stored blob: an encrypted store
	 * returns ciphertext, and it is the round trip through decryption that is being proven.
	 */
	@Synchronized
	fun writePending(entries: List<QueuedSave>): Boolean {
		val old = readEnvelope()
		// Delivery changes no authority and must not republish stored grants whose clock
		// or disclosure the live core may already have invalidated.
		if (old?.pendingSaves != null) return writeAtomic(old.copy(pendingSaves = entries), publishBus = false)
		val raw = queueJson.encodeToString(PendingQueue.serializer(), PendingQueue(entries))
		backend.write(InthStoreKeys.PENDING, raw)
		return readRaw(InthStoreKeys.PENDING).getOrNull() == raw
	}

	/** Drop stored consent state, keeping the subject id so identity survives. */
	fun clearConsentState() {
		backend.write(InthStoreKeys.SNAPSHOT, null)
		backend.write(InthStoreKeys.PENDING, null)
		backend.flush()
		// Same step, same rule as every other wipe: the keys this core put on
		// the bus go with the envelope they projected. The wipe addresses the
		// whole specification table -- [TcStorageBusSink.clear] says why.
		publishTcStorageBus(null)
	}

	/** Repair metadata only. Use [com.inth.core.ConsentCore.rebuildTcStorageBus] to restore
	 * consent rows after current clock, list, configuration and identity validation. */
	@Synchronized
	fun rebuildTcStorageBus() {
		// A raw store has no current clock/config/identity validation. Restore metadata only.
		publishTcStorageBus(readEnvelope()?.copy(iabConsent = null))
	}

	/** Flush buffered writes to durable storage. */
	fun flush() = backend.flush()

	private fun readRaw(key: String): Result<String?> =
		try {
			Result.success(backend.read(key))
		} catch (error: Exception) {
			onReadFailure(key, error)
			Result.failure(error)
		}

	private fun <T : Any> tryDecode(
		key: String,
		deserializer: DeserializationStrategy<T>,
		json: Json = this.json,
		raw: String? = readRaw(key).getOrNull(),
		prepare: (String) -> String = { it },
	): T? {
		if (raw.isNullOrEmpty()) {
			return null
		}
		return try {
			json.decodeFromString(deserializer, prepare(raw))
		} catch (error: Exception) {
			onReadFailure(key, error)
			null
		}
	}
}
