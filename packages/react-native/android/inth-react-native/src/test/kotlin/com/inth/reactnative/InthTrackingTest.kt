package com.inth.reactnative

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentState
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android half of the platform tracking gate.
 *
 * Android answers one arm and refuses one call, so what is worth proving is not the
 * branch coverage: it is that the arm it reports means "no platform gate here" and can
 * never be read as "not determined yet", and that no arm, including the one Android
 * actually sends, moves a consent decision. The last block is
 * `packages/native-protocol/CONTRACT.md` read as a table, checked against the core's own
 * [ConsentSnapshot.decision] rather than against a copy of the rule.
 */
class InthTrackingTest {
	private val json = Json { ignoreUnknownKeys = true }

	@Test
	fun `android reports the arm for a platform with no gate, never not-determined`() {
		assertEquals(InthTrackingAuthorization.UNSUPPORTED, InthTracking.status)
		assertNotEquals(
			"`unsupported` means the platform asks nothing; `not-determined` means a " +
				"subject is still owed a question. The JavaScript combinator reads them " +
				"oppositely, so they must stay two arms.",
			InthTrackingAuthorization.NOT_DETERMINED.wireValue,
			InthTracking.status.wireValue,
		)
	}

	@Test
	fun `the arm spellings are the ones the JavaScript protocol compares against`() {
		val expected = mapOf(
			InthTrackingAuthorization.AUTHORIZED to "authorized",
			InthTrackingAuthorization.DENIED to "denied",
			InthTrackingAuthorization.NOT_DETERMINED to "not-determined",
			InthTrackingAuthorization.RESTRICTED to "restricted",
			InthTrackingAuthorization.UNSUPPORTED to "unsupported",
		)

		assertEquals(
			"every arm in the shared vocabulary reaches the wire",
			expected.keys,
			InthTrackingAuthorization.entries.toSet(),
		)
		for ((arm, wire) in expected) {
			// Written against strings so a renamed `wireValue` fails rather than
			// agreeing with itself. `not-determined` is the one a hand-written reader
			// gets wrong.
			assertEquals(wire, arm.wireValue)
		}
	}

	@Test
	fun `the tracking payload carries the arm and nothing else`() {
		val payload = parse(InthPayload.trackingAuthorization(InthTracking.status))

		assertEquals(
			"no consent field may ride along on a platform answer",
			listOf("status"),
			payload.keys.toList(),
		)
		assertEquals("unsupported", payload["status"]!!.jsonPrimitive.content)
	}

	@Test
	fun `a tracking request has a rejection code the host can branch on`() {
		// The two codes the JavaScript contract names. Android only ever has one.
		assertEquals("INTH_TRACKING_UNSUPPORTED", InthTracking.REJECT_UNSUPPORTED)
		assertTrue(
			"the message has to answer the question the refusal raises",
			InthTracking.MESSAGE_UNSUPPORTED.contains("Inth decision alone"),
		)
	}

	@Test
	fun `no tracking arm moves a consent decision`() {
		val granted = ConsentState(measurement = true)
		val refused = granted.copy(measurement = false)
		val snapshots = listOf(
			ConsentDecision.GRANTED to ConsentSnapshot(
				policyPending = false,
				ready = true,
				effectivePermissions = granted,
			),
			ConsentDecision.DENIED to ConsentSnapshot(
				policyPending = false,
				ready = true,
				effectivePermissions = refused,
			),
			// Pending with the permission already stored: the flags, not the
			// permission, are what is unanswered here.
			ConsentDecision.PENDING to ConsentSnapshot(
				policyPending = true,
				ready = false,
			),
		)

		for ((expected, snapshot) in snapshots) {
			val baseline = snapshot.decision(ConsentCategory.MEASUREMENT)
			assertEquals(expected, baseline)

			for (arm in InthTrackingAuthorization.entries) {
				assertEquals(
					"arm ${arm.wireValue} moved a ${baseline.name} decision",
					baseline,
					snapshot.decision(ConsentCategory.MEASUREMENT),
				)
				assertTrue(
					"arm ${arm.wireValue} opened a ${baseline.name} category",
					!mayTrack(baseline, arm) || baseline == ConsentDecision.GRANTED,
				)
			}
		}
	}

	/** The combination rule, written from the contract's sentence, not from production code. */
	private fun mayTrack(
		decision: ConsentDecision,
		arm: InthTrackingAuthorization,
	): Boolean = decision == ConsentDecision.GRANTED &&
		(arm == InthTrackingAuthorization.AUTHORIZED || arm == InthTrackingAuthorization.UNSUPPORTED)

	private fun parse(raw: String): JsonObject = json.parseToJsonElement(raw).jsonObject
}
