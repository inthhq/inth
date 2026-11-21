package com.inth.core

import com.inth.core.model.ConsentCategory
import com.inth.core.model.KernelError
import com.inth.core.model.KernelUser
import com.inth.core.model.ConsentSubject
import com.inth.core.model.LiftOptOutPayload
import com.inth.core.model.OptOutPayload
import com.inth.core.model.QueuedSave
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.Clock
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.InthTransport
import com.inth.core.transport.InitContext
import com.inth.core.transport.LiftOptOutOutcome
import com.inth.core.transport.LinkOutcome
import com.inth.core.transport.OptOutOutcome
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome

/**
 * Storage double that records the order of reads and writes, which is how the
 * tests prove the queue hits disk before the network rather than after.
 */
class InMemoryKeyValueStore(
	initial: Map<String, String> = emptyMap(),
	/** Shared with the transport double so one test can order disk against wire. */
	val eventLog: MutableList<String> = mutableListOf(),
) : KeyValueStore {
	private val data = LinkedHashMap(initial)

	val events: List<String>
		get() = eventLog.toList()

	val keys: Set<String>
		get() = data.keys.toSet()

	/** When true, [writeDurably] refuses every write and returns false without mutating [data]. */
	var refuseDurableWrites: Boolean = false

	// This fake's dictionary is its complete storage, with no buffered writes.
	override fun writeDurably(key: String, value: String?): Boolean {
		if (refuseDurableWrites) {
			eventLog += "refused:$key"
			return false
		}
		write(key, value)
		return true
	}

	override fun read(key: String): String? {
		eventLog += "read:$key"
		return data[key]
	}

	override fun write(
		key: String,
		value: String?,
	) {
		eventLog += if (value == null) "delete:$key" else "write:$key"
		if (value == null) {
			data.remove(key)
		} else {
			data[key] = value
		}
	}

	override fun flush() {
		eventLog += "flush"
	}

	/** Seed a value without leaving a write in the log, for hydration fixtures. */
	fun putSilently(
		key: String,
		value: String,
	) {
		data[key] = value
	}
}

/**
 * Scripted transport double.
 *
 * Answers come from a queue and the last answer sticks, so a test scripts only the
 * transitions it cares about. [eventLog] lets a test put transport calls on the
 * same timeline as storage writes, which is how the persist-before-request rule is
 * asserted.
 */
class RecordingTransport(
	private val eventLog: MutableList<String>? = null,
) : InthTransport {
	private val responses = mutableListOf<TransportOutcome>()
	private val saveOutcomes = mutableListOf<SaveOutcome>()
	private val optOutOutcomes = mutableListOf<OptOutOutcome>()
	private val liftOptOutOutcomes = mutableListOf<LiftOptOutOutcome>()
	private var lastInit: TransportOutcome? = null
	private var lastSave: SaveOutcome = SaveOutcome.Delivered()
	private var lastOptOut: OptOutOutcome = OptOutOutcome.Delivered()
	private var lastLiftOptOut: LiftOptOutOutcome = LiftOptOutOutcome.Delivered(optOut = null, cleared = false)

	val initRequests = mutableListOf<InitContext>()
	val saveRequests = mutableListOf<QueuedSave>()
	/** Each opt-out request: payload and optional in-memory identity token. */
	val optOutRequests = mutableListOf<Pair<OptOutPayload, String?>>()
	/** Each opt-out lift request: payload and optional in-memory identity token. */
	val liftOptOutRequests = mutableListOf<Pair<LiftOptOutPayload, String?>>()
	/** Each link request: subject id, external id, identity token. */
	val linkRequests = mutableListOf<Triple<String, String, String>>()
	private var linkOutcome: LinkOutcome = LinkOutcome.Linked()

	/** Answer every later link request with [outcome]. */
	fun respondLink(outcome: LinkOutcome): RecordingTransport {
		linkOutcome = outcome
		return this
	}

	/** Queue one more init answer; the last one sticks. */
	fun respondInit(outcome: TransportOutcome): RecordingTransport {
		responses += outcome
		return this
	}

	/** Queue one more write answer; the last one sticks. */
	fun respondSave(outcome: SaveOutcome): RecordingTransport {
		saveOutcomes += outcome
		return this
	}

	/** Queue one more opt-out answer; the last one sticks. */
	fun respondOptOut(outcome: OptOutOutcome): RecordingTransport {
		optOutOutcomes += outcome
		return this
	}

	/** Queue one more opt-out lift answer; the last one sticks. */
	fun respondLiftOptOut(outcome: LiftOptOutOutcome): RecordingTransport {
		liftOptOutOutcomes += outcome
		return this
	}

	override fun init(context: InitContext): TransportOutcome {
		record("network:init")
		initRequests += context
		val next = responses.removeFirstOrNull() ?: lastInit ?: TransportOutcome.NetworkFailure("no response scripted")
		lastInit = next
		return next
	}

	override fun save(entry: QueuedSave): SaveOutcome {
		record("network:save")
		saveRequests += entry
		val next = saveOutcomes.removeFirstOrNull() ?: lastSave
		lastSave = next
		return next
	}

	override fun optOut(
		payload: OptOutPayload,
		identityToken: String?,
	): OptOutOutcome {
		record("network:optOut")
		optOutRequests += payload to identityToken
		val next = optOutOutcomes.removeFirstOrNull() ?: lastOptOut
		lastOptOut = next
		return next
	}

	override fun liftOptOut(
		payload: LiftOptOutPayload,
		identityToken: String?,
	): LiftOptOutOutcome {
		record("network:liftOptOut")
		liftOptOutRequests += payload to identityToken
		val next = liftOptOutOutcomes.removeFirstOrNull() ?: lastLiftOptOut
		lastLiftOptOut = next
		return next
	}

	private fun record(event: String) {
		eventLog?.add(event)
	}

	override fun link(
		subject: ConsentSubject,
		user: KernelUser,
		identityToken: String,
	): LinkOutcome {
		record("network:link")
		linkRequests += Triple(subject.id, user.externalId, identityToken)
		return linkOutcome
	}
}

/** HTTP double for the header contract; never opens a socket. */
class RecordingHttpClient(
	private val handler: (HttpRequest) -> HttpResponse,
) : HttpClient {
	val requests = mutableListOf<HttpRequest>()

	override fun send(request: HttpRequest): HttpResponse {
		requests += request
		return handler(request)
	}
}

/**
 * A store that accepts writes to one key and keeps nothing, which is what a host store
 * does once it has given up on its key: [com.inth.core.store.ResilientKeyValueStore]
 * reports the failure and returns rather than throwing out of a launch hook.
 *
 * The point is that the caller above gets no exception. Everything that believes the write
 * landed believes it for the same reason the host gave, so the only thing that can catch
 * this is reading the bytes back.
 */
class VanishingKeyValueStore(
	private val victim: String,
	/** Shared with the transport double, so one test can order disk against wire. */
	private val eventLog: MutableList<String> = mutableListOf(),
) : KeyValueStore {
	private val data = LinkedHashMap<String, String>()

	/** What the store actually holds, which is the honest measure of what was written. */
	val storedKeys: Set<String>
		get() = data.keys.toSet()

	/** The order reads and writes happened in. */
	val events: List<String>
		get() = eventLog.toList()

	override fun read(key: String): String? {
		eventLog += "read:$key"
		return data[key]
	}

	override fun write(
		key: String,
		value: String?,
	) {
		eventLog += if (value == null) "delete:$key" else "write:$key"
		if (key == victim) {
			return
		}
		if (value == null) {
			data.remove(key)
		} else {
			data[key] = value
		}
	}
}

/** Clock the tests advance by hand, so expiry and deadlines are exact. */
class FixedClock(start: Long = 1_700_000_000_000L) : Clock {
	var now: Long = start

	override fun nowMillis(): Long = now

	/** Move time forward. */
	fun advance(millis: Long) {
		now += millis
	}
}

/**
 * A deterministic harness subject id: `sub_` plus [sequence] in base58, so `sub_2` for
 * the first one -- the alphabet's first digit is `1`, and that one stands for zero.
 *
 * The digits are base58 rather than decimal because the producer's pattern excludes
 * `0`, `O`, `I`, and `l`, and the core now refuses a stored id outside it. A decimal
 * counter would mint `sub_test10` on the tenth id, and every test that relaunches over
 * it would fail somewhere far away from this file.
 */
fun subjectIdForSequence(sequence: Int): String {
	var remaining = sequence
	val digits = StringBuilder()
	while (remaining > 0) {
		digits.insert(0, BASE58_ALPHABET[remaining % BASE58_ALPHABET.length])
		remaining /= BASE58_ALPHABET.length
	}
	return "sub_$digits"
}

private const val BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

/**
 * The host config most tests run under: every category declared. With nothing declared,
 * the permissive rules [initBody] serves by default offer `necessary` alone and ask for an
 * acknowledgement, and most tests are about the optional categories themselves.
 */
val TEST_CONFIG = NativeConfig(
	backendUrl = "https://test.inth.app",
	consentCategories = ConsentCategory.entries.toList(),
)

/** Build a kernel wired to in-memory doubles with inline task execution. */
fun testKernel(
	config: NativeConfig = TEST_CONFIG,
	store: InthStore,
	clock: FixedClock = FixedClock(),
	transport: InthTransport = InthTransport.NONE,
	/**
	 * Where init and delivery run. Left null it means inline, which is what makes ordering
	 * observable; a test that needs a real hand-off -- a send whose answer this thread
	 * cannot see -- passes an executor of its own.
	 */
	executor: TaskExecutor? = null,
	/** Receives every error the core emits, so a test can assert on the codes. */
	logger: (KernelError) -> Unit = {},
): ConsentCore {
	var queueSequence = 0
	val nextQueueId: () -> String = {
		queueSequence += 1
		"%08d-0000-4000-8000-000000000000".format(queueSequence)
	}
	// Queue ids keep the UUID shape: they never leave the device, and PendingQueueTest
	// compares them verbatim. Subject ids cannot. The core refuses a stored id outside the
	// producer's pattern and discards the envelope stored under it, so a harness minting
	// the legacy shape would turn every relaunch test into a test about that instead.
	var subjectSequence = 0
	val nextSubjectId: () -> String = {
		subjectSequence += 1
		subjectIdForSequence(subjectSequence)
	}
	return ConsentCore(
		config = config,
		store = store,
		clock = clock,
		transport = transport,
		// Inline execution makes ordering observable: a save's disk write and its
		// delivery are finished by the time the call returns.
		executor = executor ?: TaskExecutor.DIRECT,
		// Deterministic ids on both seams, so a replay assertion can compare queue
		// entries and an identity assertion can compare subjects.
		subjectIdGenerator = nextSubjectId,
		queueIdGenerator = nextQueueId,
		logger = logger,
	)
}

/** A realistic 30 day choice window, the shape a resolved rule arrives in. */
fun initBody(
	policyId: String = "us-ca",
	model: String = "\"opt-in\"",
	prompt: String = "\"choice\"",
	scope: String? = null,
	scopeMode: String? = "\"permissive\"",
	choiceMs: Long = 30L * 24 * 60 * 60 * 1000,
	noticeMs: Long = 180L * 24 * 60 * 60 * 1000,
	choiceFingerprint: String = "choice-fp-1",
	policyFingerprint: String = "policy-fp-1",
	// `policyFingerprintsSchema` requires all three, so a body that answers only two
	// is not a body the reader may accept. A notice dismissal binds to this one.
	noticeFingerprint: String = "notice-fp-1",
	gpcDenyCategories: String? = null,
	/**
	 * The rule's `rights` as raw JSON. Defaults to the set the schema requires for [model],
	 * which is what the backend serves; `null` writes no key, which the reader refuses.
	 */
	rights: String? = requiredRightsJson(model),
	policySnapshotToken: String? = "snap-1",
	includePolicyResolution: Boolean = true,
	version: String? = "1",
	/**
	 * A vendor-list document to embed under `gvl`, as raw JSON text. Null writes no key, which is the
	 * ordinary case: `packages/backend/src/http/init.ts` embeds one only for a matched `iab` policy.
	 */
	gvl: String? = null,
): String {
	val policy = buildList {
		add("\"id\":\"$policyId\"")
		add("\"model\":$model")
		add("\"prompt\":$prompt")
		scope?.let { add("\"scope\":$it") }
		scopeMode?.let { add("\"scopeMode\":$it") }
		add("\"validity\":{\"choiceMs\":$choiceMs,\"noticeMs\":$noticeMs}")
		gpcDenyCategories?.let { add("\"privacySignals\":{\"gpc\":{\"denyCategories\":$it}}") }
		rights?.let { add("\"rights\":$it") }
	}.joinToString(",", prefix = "{", postfix = "}")

	val resolution = buildList {
		version?.let { add("\"version\":$it") }
		add("\"status\":\"matched\"")
		add("\"policyId\":\"$policyId\"")
		add("\"matchedBy\":\"country\"")
		add(
			"\"fingerprints\":{\"policy\":\"$policyFingerprint\"," +
				"\"choice\":\"$choiceFingerprint\",\"notice\":\"$noticeFingerprint\"}",
		)
		add("\"policy\":$policy")
	}.joinToString(",", prefix = "{", postfix = "}")

	val token = policySnapshotToken?.let { ""","policySnapshotToken":"$it"""" } ?: ""
	// `gvl` goes last so a body string a test already compares stays byte-identical when it does not
	// serve a list; `InitMapper` looks keys up rather than reading them in order.
	val list = gvl?.let { ""","gvl":$it""" } ?: ""
	return if (includePolicyResolution) {
		"""{"policyResolution":$resolution$token$list}"""
	} else {
		"""{"location":{"countryCode":"US"}$token$list}"""
	}
}

/**
 * `requiredPolicyRights` for a raw JSON model value such as `"opt-out"`, as a JSON array.
 * A model this build does not name gets an empty set; the reader refuses the model anyway.
 */
fun requiredRightsJson(model: String): String {
	val parsed = com.inth.core.model.ConsentModel.fromWireName(model.trim().removeSurrounding("\""))
	val rights = parsed?.let { com.inth.core.policy.PolicyRight.requiredFor(it) } ?: emptyList()
	return rights.joinToString(",", prefix = "[", postfix = "]") { "\"${it.wireName}\"" }
}

/** The same body, wrapped in the JSON object the transport hands over. */
fun initSuccess(
	vararg extraHeaders: Pair<String, String>,
	body: String = initBody(),
): TransportOutcome {
	val element = kotlinx.serialization.json.Json.parseToJsonElement(body)
	return TransportOutcome.Success(element, extraHeaders.toMap())
}
