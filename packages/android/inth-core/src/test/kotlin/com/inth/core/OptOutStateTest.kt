package com.inth.core

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutMethod
import com.inth.core.model.OptOutRecord
import com.inth.core.model.OptOutRight
import com.inth.core.policy.OPT_OUT_REPROMPT_WAIT_MS
import com.inth.core.policy.OptOutLock
import com.inth.core.policy.OptOutVia
import com.inth.core.policy.ResolvedOptOutState
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.store.SnapshotEnvelope
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Pure opt-out display state and per-category lock helpers, mirroring
 * `packages/sdk/core/src/libs/__tests__/opt-out-state.test.ts`.
 */
class OptOutStateTest {
	private fun optOutInit(
		scope: String = """["functionality","marketing","measurement"]""",
		gpcDenyCategories: String = """["marketing","measurement"]""",
		model: String = "\"opt-out\"",
		prompt: String = "\"none\"",
	) = initSuccess(
		body = initBody(
			policyId = "us-ca-opt-out",
			model = model,
			prompt = prompt,
			scope = scope,
			scopeMode = "\"permissive\"",
			gpcDenyCategories = gpcDenyCategories,
		),
	)

	private fun kernelWith(
		record: OptOutRecord? = null,
		gpc: Boolean = false,
		scope: String = """["functionality","marketing","measurement"]""",
		gpcDenyCategories: String = """["marketing","measurement"]""",
		model: String = "\"opt-out\"",
		prompt: String = "\"none\"",
	): ConsentCore {
		val backend = InMemoryKeyValueStore()
		if (record != null) {
			backend.putSilently(
				InthStoreKeys.SUBJECT,
				InthJson.storage.encodeToString(ConsentSubject.serializer(), ConsentSubject(id = "sub_2")),
			)
			backend.putSilently(
				InthStoreKeys.SNAPSHOT,
				InthJson.storage.encodeToString(
					SnapshotEnvelope.serializer(),
					SnapshotEnvelope(
						snapshot = ConsentSnapshot(
							subject = ConsentSubject(id = "sub_2"),
							optOut = record,
						),
					),
				),
			)
		}
		return testKernel(
			config = TEST_CONFIG.copy(detectedGpc = gpc),
			store = InthStore(backend),
			clock = FixedClock(NOW),
			transport = RecordingTransport().respondInit(
				optOutInit(scope = scope, gpcDenyCategories = gpcDenyCategories, model = model, prompt = prompt),
			),
		).also { it.bootstrap() }
	}

	@Test
	fun `resolveOptOutState covers available, request, signal, account and non-opt-out rules`() {
		assertEquals(
			ResolvedOptOutState(
				available = true,
				honored = false,
				via = null,
				lock = null,
				categories = listOf(ConsentCategory.MARKETING, ConsentCategory.MEASUREMENT),
				decidingCategory = ConsentCategory.MARKETING,
				optInPromptAllowedAt = null,
			),
			kernelWith().optOutState(),
		)

		val buttonRecord = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		assertEquals(
			ResolvedOptOutState(
				available = true,
				honored = true,
				via = OptOutVia.REQUEST,
				lock = null,
				categories = listOf(ConsentCategory.MARKETING, ConsentCategory.MEASUREMENT),
				decidingCategory = ConsentCategory.MARKETING,
				optInPromptAllowedAt = NOW + OPT_OUT_REPROMPT_WAIT_MS,
			),
			kernelWith(record = buttonRecord).optOutState(),
		)

		// Active GPC over a button record reports via=SIGNAL and lock=GPC_ACTIVE.
		val gpcOverButton = kernelWith(record = buttonRecord, gpc = true).optOutState()
		assertEquals(OptOutVia.SIGNAL, gpcOverButton.via)
		assertEquals(OptOutLock.GPC_ACTIVE, gpcOverButton.lock)

		// GPC record after GPC stops stays via=SIGNAL with lock=null.
		val gpcRecord = buttonRecord.copy(method = OptOutMethod.GPC)
		val afterGpc = kernelWith(record = gpcRecord, gpc = false).optOutState()
		assertEquals(OptOutVia.SIGNAL, afterGpc.via)
		assertNull(afterGpc.lock)

		// Account-held opt-out reports HELD_BY_ACCOUNT, and GPC outranks it when both apply.
		for (holder in listOf(OptOutHolder.PERSON, OptOutHolder.BOTH)) {
			val account = kernelWith(record = buttonRecord.copy(heldBy = holder), gpc = false).optOutState()
			assertEquals(OptOutLock.HELD_BY_ACCOUNT, account.lock)
			assertEquals(OptOutVia.REQUEST, account.via)
		}
		val bothBlock = kernelWith(record = buttonRecord.copy(heldBy = OptOutHolder.PERSON), gpc = true).optOutState()
		assertEquals(OptOutLock.GPC_ACTIVE, bothBlock.lock)
		assertEquals(OptOutVia.SIGNAL, bothBlock.via)

		// Under opt-in, available is false while a held record is still honored.
		val optInWithRecord = kernelWith(
			record = gpcRecord,
			scope = """["marketing"]""",
			gpcDenyCategories = "[]",
			model = "\"opt-in\"",
			prompt = "\"choice\"",
		).optOutState()
		assertEquals(false, optInWithRecord.available)
		assertEquals(true, optInWithRecord.honored)
		assertEquals(OptOutVia.SIGNAL, optInWithRecord.via)
		assertEquals(ConsentCategory.MARKETING, optInWithRecord.decidingCategory)
	}

	@Test
	fun `resolveCategoryOptOutLock locks gpc categories and deciding category, annotates account on deciding only`() {
		val gpcRecord = OptOutRecord(
			rights = listOf(OptOutRight.SALE),
			method = OptOutMethod.GPC,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		// GPC maps marketing only: marketing is locked, measurement stays editable.
		val marketingOnlyGpc = kernelWith(
			record = gpcRecord,
			gpc = true,
			gpcDenyCategories = """["marketing"]""",
		)
		assertNull(marketingOnlyGpc.categoryOptOutLock(ConsentCategory.NECESSARY))
		assertNull(marketingOnlyGpc.categoryOptOutLock(ConsentCategory.FUNCTIONALITY))
		assertEquals(OptOutLock.GPC_ACTIVE, marketingOnlyGpc.categoryOptOutLock(ConsentCategory.MARKETING))
		assertNull(marketingOnlyGpc.categoryOptOutLock(ConsentCategory.MEASUREMENT))

		// GPC maps measurement only while marketing is deciding: both lock (live gpc on measurement, lift blocker on marketing).
		val measurementOnlyGpc = kernelWith(
			record = gpcRecord,
			gpc = true,
			gpcDenyCategories = """["measurement"]""",
		)
		assertEquals(OptOutLock.GPC_ACTIVE, measurementOnlyGpc.categoryOptOutLock(ConsentCategory.MEASUREMENT))
		assertEquals(OptOutLock.GPC_ACTIVE, measurementOnlyGpc.categoryOptOutLock(ConsentCategory.MARKETING))
		assertNull(measurementOnlyGpc.categoryOptOutLock(ConsentCategory.FUNCTIONALITY))

		// Account-held opt-out annotates only the deciding category.
		val accountHeld = kernelWith(
			record = gpcRecord.copy(method = OptOutMethod.BUTTON, heldBy = OptOutHolder.PERSON),
			gpc = false,
		)
		assertEquals(OptOutLock.HELD_BY_ACCOUNT, accountHeld.categoryOptOutLock(ConsentCategory.MARKETING))
		assertNull(accountHeld.categoryOptOutLock(ConsentCategory.MEASUREMENT))
		assertNull(accountHeld.categoryOptOutLock(ConsentCategory.FUNCTIONALITY))

		// When marketing is out of scope, measurement is the deciding category.
		val measurementDeciding = kernelWith(
			record = gpcRecord.copy(method = OptOutMethod.BUTTON, heldBy = OptOutHolder.BOTH),
			gpc = false,
			scope = """["functionality","measurement"]""",
		)
		assertEquals(OptOutLock.HELD_BY_ACCOUNT, measurementDeciding.categoryOptOutLock(ConsentCategory.MEASUREMENT))
		assertNull(measurementDeciding.categoryOptOutLock(ConsentCategory.MARKETING))
	}

	private companion object {
		const val NOW = 1_770_000_000_000L
	}
}
