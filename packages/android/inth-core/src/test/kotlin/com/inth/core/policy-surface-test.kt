package com.inth.core

import com.inth.core.model.KernelOverrides
import com.inth.core.policy.PolicyLayout
import com.inth.core.policy.PolicyRead
import com.inth.core.policy.PolicySurface
import com.inth.core.policy.StrictPolicyReader
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.wire.SnapshotWire
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * `packages/native-protocol/policy-surface/cases.json`: how a matched rule's `surface` reads, and
 * the phone layout it resolves to. The expected answers are `readPolicyResolutionWire` in
 * `@inth/sdk-schema` and `resolveLayout` in `@inth/sdk-core`;
 * `packages/sdk/core/src/libs/__tests__/policy-surface-native-fixture.test.ts` checks them on
 * every run, and `policy-surface-tests.swift` runs the same cases through `PolicyWireReader`.
 */
class PolicySurfaceFixtureTest {
	private val cases = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/policy-surface/cases.json") }.first { it.exists() }
		.let { Json.parseToJsonElement(it.readText()).jsonObject.getValue("cases").jsonArray.map { case -> case.jsonObject } }

	/** The fixture leaves out an absent field, so the comparison does too. */
	private val json = Json { explicitNulls = false }

	private fun wire(case: JsonObject): JsonElement =
		case.getValue("input").jsonObject.getValue("policyResolution")

	@Test fun `every case reads as the web reads it`() {
		assertTrue(cases.size > 20)
		for (case in cases) {
			val id = case.getValue("id").jsonPrimitive.content
			val actual = when (val read = StrictPolicyReader.read(wire(case))) {
				is PolicyRead.Matched -> JsonObject(mapOf(
					"layout" to (read.surface?.let {
						json.encodeToJsonElement(PolicyLayout.serializer(), PolicyLayout.resolve(it, read.policy.model, read.policy.prompt))
					} ?: JsonNull),
					"status" to JsonPrimitive("matched"),
					"surface" to (read.surface?.let { json.encodeToJsonElement(PolicySurface.serializer(), it) } ?: JsonNull),
				))
				is PolicyRead.Unreadable -> JsonObject(mapOf("reason" to JsonPrimitive(read.reason), "status" to JsonPrimitive("failed")))
				else -> JsonObject(mapOf("unexpected" to JsonPrimitive(read.toString())))
			}
			assertEquals(case.getValue("expected"), actual, id)
		}
	}

	private fun bootedCore(caseId: String): Pair<ConsentCore, JsonObject> {
		val case = cases.first { it.getValue("id").jsonPrimitive.content == caseId }
		val body = JsonObject(mapOf(
			"policyResolution" to wire(case),
			"location" to JsonObject(mapOf("countryCode" to JsonPrimitive("DE"), "regionCode" to JsonNull)),
		)).toString()
		val core = testKernel(
			NativeConfig("https://cmp.example.test", overrides = KernelOverrides(country = "DE")),
			InthStore(InMemoryKeyValueStore()), FixedClock(),
			RecordingTransport().respondInit(initSuccess(body = body)),
		)
		core.bootstrap()
		return core to case.getValue("expected").jsonObject
	}

	@Test fun `the snapshot carries the surface and its layout, and the bridge spells them as the wire does`() {
		val (core, expected) = bootedCore("card-center-blocks")
		val resolution = core.snapshot().resolution
		assertFalse(core.snapshot().policyPending)
		assertEquals(
			PolicySurface(container = PolicySurface.Container.Card(PolicySurface.CardPosition.CENTER)),
			resolution.surface,
		)
		assertEquals(true, resolution.layout?.blocking)
		val bridged = SnapshotWire.toJsonElement(core.snapshot()).getValue("resolution").jsonObject
		assertEquals(expected.getValue("surface"), bridged.getValue("surface"))
		assertEquals(expected.getValue("layout"), bridged.getValue("layout"))
	}

	@Test fun `a rule without a surface leaves the bridged resolution as it was`() {
		val (core, _) = bootedCore("no-surface")
		assertNull(core.snapshot().resolution.surface)
		val bridged = SnapshotWire.toJsonElement(core.snapshot()).getValue("resolution").jsonObject
		assertEquals(setOf("status", "policyId", "fingerprint"), bridged.keys)
	}

	@Test fun `a stored surface survives the envelope round trip`() {
		val (core, _) = bootedCore("banner-top-flush")
		val snapshot = core.snapshot()
		val stored = InthJson.storage.encodeToString(com.inth.core.model.ConsentSnapshot.serializer(), snapshot)
		assertEquals(
			snapshot.resolution,
			InthJson.storage.decodeFromString(com.inth.core.model.ConsentSnapshot.serializer(), stored).resolution,
		)
	}

	@Test fun `a surface the reader refuses fails closed`() {
		val (core, _) = bootedCore("surface-without-presentation")
		assertTrue(core.snapshot().policyPending)
		assertNull(core.snapshot().resolution.surface)
	}
}
