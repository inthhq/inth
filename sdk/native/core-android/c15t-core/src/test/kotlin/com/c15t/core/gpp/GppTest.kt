package com.c15t.core.gpp

import com.c15t.core.CommitIntent
import com.c15t.core.FixedClock
import com.c15t.core.NativeConfig
import com.c15t.core.RecordingTcStorageBus
import com.c15t.core.RecordingTransport
import com.c15t.core.iab.IabChoices
import com.c15t.core.iab.IabCommittedConsent
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.initBody
import com.c15t.core.initSuccess
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentLocation
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.ConsentState
import com.c15t.core.model.GpcSignal
import com.c15t.core.model.KernelOverrides
import com.c15t.core.model.PolicyResolution
import com.c15t.core.model.PrivacySignals
import com.c15t.core.policy.EvaluationPolicy
import com.c15t.core.policy.PolicyRead
import com.c15t.core.policy.StrictPolicyReader
import com.c15t.core.policy.PolicyPrompt
import com.c15t.core.policy.PolicyRight
import com.c15t.core.policy.ScopeMode
import com.c15t.core.store.C15tStore
import com.c15t.core.InMemoryKeyValueStore
import com.c15t.core.store.TcBusValue
import com.c15t.core.testKernel
import com.c15t.core.transport.ProducerContract
import com.c15t.core.wire.SnapshotWire
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * `native/protocol/gpp/cases.json`: the strings and in-app keys `core-swift` and the web
 * encoder produce for the same inputs. `GPPTests.swift` runs the same cases.
 */
class GppFixtureTest {
	private val fixture = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "native/protocol/gpp/cases.json") }.first { it.exists() }
		.let { Json.parseToJsonElement(it.readText()).jsonObject }

	@Test fun `encoder cases match the shared strings`() {
		for (case in fixture.getValue("encoder").jsonArray.map { it.jsonObject }) {
			val sections = case.getValue("sections").jsonArray.map { it.jsonObject }.map { section ->
				val id = section.getValue("id").jsonPrimitive.int
				if (id == GppUsNational.ID) {
					GppSection(id, GppEncoder.encodeUsNational(fields(section.getValue("usnat").jsonObject),
						section.getValue("gpc").jsonPrimitive.boolean))
				} else GppSection(id, section.getValue("encoded").jsonPrimitive.content)
			}
			assertEquals(case.getValue("expected").jsonPrimitive.content, GppEncoder.encodeGppString(sections), id(case))
		}
	}

	@Test fun `resolver cases match the shared strings and storage rows`() {
		for (case in fixture.getValue("resolver").jsonArray.map { it.jsonObject }) {
			val input = case.getValue("input").jsonObject
			val expected = case.getValue("expected").jsonObject
			val tcString = input["tcString"]?.jsonPrimitive?.contentOrNull
			val signal = GppResolver.resolve(snapshot(input), policy(input), tcString, options(input))
			assertEquals(expected["gppString"]?.jsonPrimitive?.contentOrNull, signal?.gppString, id(case))
			assertEquals(expected.getValue("sectionIds").jsonArray.map { it.jsonPrimitive.int }, signal?.sectionIds ?: emptyList(), id(case))
			val usnat = expected["usnat"] as? JsonObject
			if (usnat != null) {
				val values = GppResolver.usNationalValues(snapshot(input), policy(input)!!, options(input)!!)
				assertEquals(fields(JsonObject(usnat - "Gpc")), values, id(case))
			}
			val iab = tcString?.let { committed(it) }
			val storage = GppStorageBusProjection.values(signal, iab)
			val want = expected.getValue("storage").jsonObject.mapValues { (_, value) ->
				val primitive = value.jsonPrimitive
				if (primitive.isString) TcBusValue.TextValue(primitive.content) else TcBusValue.NumberValue(primitive.int)
			}
			assertEquals(want, storage, id(case))
			assertTrue(storage.keys.all { it in GppStorageBusKeys.ALL_NAMES }, "${id(case)}: a key the sink does not own")
		}
	}

	private fun id(case: JsonObject) = case.getValue("id").jsonPrimitive.content

	private fun fields(values: JsonObject): Map<String, List<Int>> = values.mapValues { (_, value) ->
		if (value is JsonArray) value.map { it.jsonPrimitive.int } else listOf(value.jsonPrimitive.int)
	}

	private fun snapshot(input: JsonObject): ConsentSnapshot {
		val permissions = input.getValue("effectivePermissions").jsonObject
		fun allowed(name: String) = permissions.getValue(name).jsonPrimitive.boolean
		return ConsentSnapshot(
			ready = input.getValue("ready").jsonPrimitive.boolean,
			policyPending = input.getValue("policyPending").jsonPrimitive.boolean,
			resolution = PolicyResolution(status = input.getValue("resolution").jsonPrimitive.content),
			location = ConsentLocation(country = input["location"]?.jsonPrimitive?.contentOrNull),
			overrides = KernelOverrides(country = input["overrideCountry"]?.jsonPrimitive?.contentOrNull),
			effectivePermissions = ConsentState(
				experience = allowed("experience"),
				functionality = allowed("functionality"),
				marketing = allowed("marketing"),
				measurement = allowed("measurement"),
			),
			privacySignals = PrivacySignals(GpcSignal.derive(override = null, detected = input.getValue("gpc").jsonPrimitive.boolean)),
		)
	}

	private fun policy(input: JsonObject): EvaluationPolicy? {
		val policy = input["policy"] as? JsonObject ?: return null
		val model = ConsentModel.fromWireName(policy.getValue("model").jsonPrimitive.content)!!
		return EvaluationPolicy(
			id = "fixture", model = model, prompt = PolicyPrompt.CHOICE, scope = ConsentCategory.OPTIONAL,
			scopeMode = ScopeMode.PERMISSIVE, choiceMs = 1000, noticeMs = 1000,
			choiceFingerprint = "c", policyFingerprint = "p",
			rights = policy.getValue("rights").jsonArray.map { PolicyRight.fromWireName(it.jsonPrimitive.content)!! },
		)
	}

	private fun options(input: JsonObject): GppOptions? {
		val options = input["options"]
		if (options == null || options is JsonNull) return null
		val raw = options.jsonObject
		return GppOptions(
			mspaMode = raw["mspaMode"]?.jsonPrimitive?.contentOrNull?.let { GppMspaMode.fromWireName(it)!! },
			optOutCategories = raw["optOutCategories"]?.jsonArray?.map { ConsentCategory.fromWireName(it.jsonPrimitive.content)!! }
				?: listOf(ConsentCategory.MARKETING),
			tcf = (raw["tcf"] as? JsonPrimitive)?.boolean ?: true,
		)
	}

	private fun committed(tcString: String) = IabCommittedConsent(IabConfiguration(53, 7, "GB"), IabChoices(), "sub_test", null,
		"f", 42, 5, 1, 0, 0, tcString)
}

/**
 * `native/protocol/gpp/policy-rights-cases.json`: how a matched rule's `rights` read. The
 * expected answers are `readPolicyResolutionWire`'s in `@c15t/schema`, and `GPPTests.swift`
 * runs the same cases through `PolicyWireReader`, so both cores hand `GppResolver` the same
 * rights for the same `/init` body, or both refuse it.
 */
class PolicyRightsFixtureTest {
	private val cases = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "native/protocol/gpp/policy-rights-cases.json") }.first { it.exists() }
		.let { Json.parseToJsonElement(it.readText()).jsonObject.getValue("cases").jsonArray.map { case -> case.jsonObject } }

	@Test fun `every case reads as the schema reads it`() {
		assertTrue(cases.isNotEmpty())
		for (case in cases) {
			val id = case.getValue("id").jsonPrimitive.content
			val expected = case.getValue("expected").jsonObject
			val read = StrictPolicyReader.read(case.getValue("policyResolution"), ProducerContract.Declared(1))
			val actual = when (read) {
				is PolicyRead.Matched -> JsonObject(mapOf(
					"accepted" to JsonPrimitive(true),
					"rights" to JsonArray(read.policy.rights.map { JsonPrimitive(it.wireName) }),
				))
				is PolicyRead.Unreadable -> JsonObject(mapOf("accepted" to JsonPrimitive(false), "reason" to JsonPrimitive(read.reason)))
				else -> JsonObject(mapOf("accepted" to JsonPrimitive(false), "unexpected" to JsonPrimitive(read.toString())))
			}
			assertEquals(expected, actual, id)
		}
	}

	@Test fun `a US visitor under an opt-out rule missing its opt-out right gets no policy, so no GPP string`() {
		val bus = RecordingTcStorageBus()
		val wire = cases.first { it.getValue("id").jsonPrimitive.content == "opt-out-missing-opt-out" }
			.getValue("policyResolution")
		val body = JsonObject(mapOf(
			"policyResolution" to wire,
			"location" to JsonObject(mapOf("countryCode" to JsonPrimitive("US"), "regionCode" to JsonNull)),
		)).toString()
		val core = testKernel(
			NativeConfig("https://cmp.example.test", overrides = KernelOverrides(country = "US"), gpp = GppOptions()),
			C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus), FixedClock(),
			RecordingTransport().respondInit(initSuccess(body = body)),
		)
		core.bootstrap()
		assertTrue(core.snapshot().policyPending)
		assertEquals(PolicyResolution.REASON_INVALID_PAYLOAD, core.snapshot().error?.code)
		assertNull(core.snapshot().gppString)
		assertTrue(bus.live.keys.none { it.startsWith("IABGPP_") })
	}
}

/** GPP through a real core: the snapshot field, the storage rows, and a cold start. */
class GppCoreTest {
	private val noChoice = "DBABLA~CVQqAAAAAACA.QA"
	private val optedOut = "DBABLA~CVQVAAAAAACA.QA"

	private fun config(gpp: GppOptions?) = NativeConfig(
		"https://cmp.example.test",
		consentCategories = ConsentCategory.entries,
		overrides = KernelOverrides(country = "US"),
		gpp = gpp,
	)

	/**
	 * An opt-out rule served with the location the backend resolved. The served location
	 * wins over the app's override once `/init` answers, as in `@c15t/core`, so a test of a
	 * US visitor has to be served a US location: `GPPTests.swift` once served Germany and
	 * got no section, correctly.
	 */
	private fun initFor(country: String) = initSuccess(
		body = JsonObject(
			Json.parseToJsonElement(initBody(model = "\"opt-out\"")).jsonObject +
				("location" to JsonObject(mapOf("countryCode" to JsonPrimitive(country), "regionCode" to JsonNull))),
		).toString(),
	)

	private fun transport(country: String = "US") = RecordingTransport()
		.respondInit(initFor(country))
		.respondInit(initFor(country))

	@Test fun `a US opt-out visitor gets usnat on the snapshot and in storage, and a refusal opts out`() {
		val bus = RecordingTcStorageBus()
		val backend = InMemoryKeyValueStore()
		val core = testKernel(config(GppOptions()), C15tStore(backend, tcStorageBus = bus), FixedClock(), transport())
		core.bootstrap()
		assertEquals("US", core.snapshot().overrides.country, "the backend placed the visitor in the US")
		assertEquals(noChoice, core.snapshot().gppString)
		assertEquals(TcBusValue.TextValue(noChoice), bus.live[GppStorageBusKeys.HDR_GPP_STRING])
		assertEquals(TcBusValue.TextValue("7"), bus.live[GppStorageBusKeys.GPP_SID])
		assertEquals(TcBusValue.TextValue("7"), bus.live[GppStorageBusKeys.HDR_SECTIONS])
		assertEquals(TcBusValue.TextValue("1"), bus.live[GppStorageBusKeys.HDR_VERSION])
		assertEquals(TcBusValue.TextValue("CVQqAAAAAACA.QA"), bus.live[GppStorageBusKeys.sectionString(7)])
		assertEquals(JsonPrimitive(noChoice), SnapshotWire.toJsonElement(core.snapshot())["gppString"])

		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(optedOut, core.snapshot().gppString)
		assertEquals(TcBusValue.TextValue(optedOut), bus.live[GppStorageBusKeys.HDR_GPP_STRING])

		// The envelope keeps no copy; a cold start derives the same string again.
		val cold = testKernel(config(GppOptions()), C15tStore(backend, tcStorageBus = bus), FixedClock(), RecordingTransport(),
			executor = com.c15t.core.spi.TaskExecutor { })
		cold.bootstrap()
		assertEquals(optedOut, cold.snapshot().gppString)
	}

	@Test fun `the location the backend matched on decides, not the app's earlier override`() {
		val bus = RecordingTcStorageBus()
		val core = testKernel(config(GppOptions()), C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus), FixedClock(),
			transport(country = "DE"))
		core.bootstrap()
		assertEquals("DE", core.snapshot().overrides.country)
		assertNull(core.snapshot().gppString)
		assertTrue(bus.live.keys.none { it.startsWith("IABGPP_") })
	}

	@Test fun `an empty opt-out list drives no opt-out when marketing is refused`() {
		val bus = RecordingTcStorageBus()
		val core = testKernel(config(GppOptions(optOutCategories = emptyList())), C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus),
			FixedClock(), transport())
		core.bootstrap()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(false, core.snapshot().effectivePermissions.marketing)
		// The same bytes as a visitor who refused nothing: SaleOptOut, SharingOptOut and
		// TargetedAdvertisingOptOut stay 2, where the default list would report 1.
		assertEquals(noChoice, core.snapshot().gppString)
		assertEquals(TcBusValue.TextValue(noChoice), bus.live[GppStorageBusKeys.HDR_GPP_STRING])
	}

	@Test fun `GPP stays off until the app turns it on`() {
		val bus = RecordingTcStorageBus()
		val core = testKernel(config(null), C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus), FixedClock(), transport())
		core.bootstrap()
		assertNull(core.snapshot().gppString)
		assertTrue(bus.live.keys.none { it.startsWith("IABGPP_") })
		assertEquals(JsonNull, SnapshotWire.toJsonElement(core.snapshot())["gppString"])
	}

	@Test fun `turning GPP off drops a string an earlier launch published`() {
		val bus = RecordingTcStorageBus()
		val backend = InMemoryKeyValueStore()
		testKernel(config(GppOptions()), C15tStore(backend, tcStorageBus = bus), FixedClock(), transport()).bootstrap()
		assertEquals(TcBusValue.TextValue(noChoice), bus.live[GppStorageBusKeys.HDR_GPP_STRING])
		val off = testKernel(config(null), C15tStore(backend, tcStorageBus = bus), FixedClock(), transport())
		off.bootstrap()
		assertNull(off.snapshot().gppString)
		assertTrue(bus.live.keys.none { it.startsWith("IABGPP_") })
	}

	@Test fun `a stored policy without rights falls back to the ones its model requires`() {
		val written = EvaluationPolicy(
			id = "p", model = ConsentModel.OPT_OUT, prompt = PolicyPrompt.CHOICE, scope = emptyList(),
			scopeMode = ScopeMode.PERMISSIVE, choiceMs = 1, noticeMs = 1, choiceFingerprint = "c", policyFingerprint = "p",
			rights = emptyList(),
		)
		val stored = JsonObject(Json.encodeToJsonElement(EvaluationPolicy.serializer(), written).jsonObject - "rights")
		val policy = Json.decodeFromJsonElement(EvaluationPolicy.serializer(), stored)
		assertEquals(listOf(PolicyRight.DISCLOSURE, PolicyRight.OPT_OUT, PolicyRight.PREFERENCES), policy.rights)
	}
}
