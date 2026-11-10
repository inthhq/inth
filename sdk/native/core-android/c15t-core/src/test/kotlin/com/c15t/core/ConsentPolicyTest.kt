package com.c15t.core

import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.KernelOverrides
import com.c15t.core.policy.PolicyPrompt
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.OfflineTransport
import java.io.File
import kotlin.test.*
import kotlinx.serialization.json.*

class ConsentPolicyTest {
	private val fixture = Json.parseToJsonElement(
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/local-policy/parity.json") }.first { it.exists() }.readText(),
	).jsonObject
	private val policy = ConsentPolicy.fromJson(buildJsonObject { put("rules", fixture.getValue("rules")) }.toString())

	private fun boot(policy: ConsentPolicy = this.policy, store: C15tStore = C15tStore(InMemoryKeyValueStore()), overrides: KernelOverrides = KernelOverrides()) =
		testKernel(NativeConfig(null, policy = policy, consentCategories = ConsentCategory.entries, overrides = overrides), store, FixedClock(), OfflineTransport)
			.also { it.bootstrap() }

	@Test fun `rules normalize exactly as the backend normalizer does`() {
		val resolved = fixture.getValue("resolved").jsonObject
		assertEquals(resolved.keys, policy.rules.map { it.id }.toSet())
		for (rule in policy.rules) assertEquals(resolved.getValue(rule.id), ConsentPolicy.normalize(rule), rule.id)
	}

	@Test fun `locations match the rule the backend matcher picks`() {
		for (case in fixture.getValue("cases").jsonArray) {
			val inputs = case.jsonObject.getValue("inputs").jsonObject
			val expected = case.jsonObject.getValue("expected").jsonObject
			val country = inputs["country"]?.jsonPrimitive?.contentOrNull
			val region = inputs["region"]?.jsonPrimitive?.contentOrNull
			assertEquals(
				expected.getValue("policyId").jsonPrimitive.content to expected.getValue("matchedBy").jsonPrimitive.content,
				policy.match(country, region),
				"$country $region",
			)
		}
	}

	@Test fun `no-backend core prompts from the in-code policy before any network`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val core = boot(store = store)
		val snapshot = core.snapshot()
		assertFalse(snapshot.policyPending)
		assertEquals("everywhere_else", snapshot.resolution.policyId)
		assertTrue(snapshot.promptRequirement.acknowledge)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		val relaunched = boot(store = store)
		assertTrue(relaunched.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(relaunched.isAllowed(ConsentCategory.MARKETING))
	}

	@Test fun `an app-supplied location picks the regional rule`() {
		val core = boot(overrides = KernelOverrides(country = "US", region = "CA"))
		assertEquals("california", core.snapshot().resolution.policyId)
		assertTrue(core.snapshot().promptRequirement.notice)
		core.setOverrides(KernelOverrides(country = "DE"))
		assertEquals("germany", core.snapshot().resolution.policyId)
	}

	@Test fun `changing the copy revision asks again after an update`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val first = boot(store = store)
		assertTrue(first.save(CommitIntent.All).ok)
		assertTrue(first.isAllowed(ConsentCategory.MEASUREMENT))
		assertTrue(boot(store = store).isAllowed(ConsentCategory.MEASUREMENT))
		val revised = ConsentPolicy(policy.rules.map { if (it.id == "everywhere_else") it.copy(copyRevision = "2027-01") else it })
		val updated = boot(revised, store)
		assertTrue(updated.snapshot().promptRequirement.acknowledge)
		assertFalse(updated.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `invalid policies and mixed modes are refused`() {
		val fallback = PolicyRule("default", PolicyMatch(fallback = true, isDefault = true), ConsentModel.OPT_IN, PolicyPrompt.CHOICE)
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(emptyList()) }
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback, fallback)) }
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(model = ConsentModel.IAB))) }
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(match = PolicyMatch(countries = listOf("DE"))))) }
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(model = ConsentModel.OPT_IN, prompt = PolicyPrompt.NOTICE))) }
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(categories = listOf(ConsentCategory.MEASUREMENT)))) }
		assertFailsWith<IllegalArgumentException> {
			ConsentPolicy(listOf(fallback.copy(categories = listOf(ConsentCategory.MEASUREMENT), scopeMode = com.c15t.core.policy.ScopeMode.STRICT, preselectedCategories = listOf(ConsentCategory.MARKETING))))
		}
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(validity = PolicyValidity(choiceDays = 0)))) }
		assertFailsWith<IllegalArgumentException> { NativeConfig("https://consent.example.test", policy = ConsentPolicy(listOf(fallback))) }
		assertFailsWith<IllegalArgumentException> {
			ConsentPolicy.fromJson("""{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","rights":["opt-out"]}]}""")
		}
		assertFailsWith<IllegalArgumentException> {
			ConsentPolicy.fromJson("""{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","categories":["ads"]}]}""")
		}
	}
}
