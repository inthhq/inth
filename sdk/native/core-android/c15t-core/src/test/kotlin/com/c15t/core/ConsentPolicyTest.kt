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

	@Test fun `fingerprints hash exactly the inputs the backend hashes`() {
		val inputs = fixture.getValue("fingerprintInputs").jsonObject
		for (rule in policy.rules) {
			val expected = inputs.getValue(rule.id).jsonObject
			val actual = ConsentPolicy.fingerprintInputs(rule)
			for (domain in listOf("choice", "notice", "policy")) assertEquals(expected.getValue(domain), actual.getValue(domain), "${rule.id} $domain")
		}
	}

	@Test fun `every policy the backend or no-backend mode refuses is refused`() {
		val accepted = fixture.getValue("invalid").jsonArray.mapNotNull { case ->
			val name = case.jsonObject.getValue("name").jsonPrimitive.content
			val rules = buildJsonObject { put("rules", case.jsonObject.getValue("rules")) }.toString()
			name.takeIf { runCatching { ConsentPolicy.fromJson(rules) }.isSuccess }
		}
		assertEquals(emptyList(), accepted, "accepted policies the backend refuses")
	}

	@Test fun `every policy the backend accepts is accepted and normalized the same way`() {
		val problems = fixture.getValue("accepted").jsonArray.mapNotNull { case ->
			val name = case.jsonObject.getValue("name").jsonPrimitive.content
			val rules = buildJsonObject { put("rules", case.jsonObject.getValue("rules")) }.toString()
			runCatching { ConsentPolicy.fromJson(rules) }.fold(
				onSuccess = { policy -> name.takeIf { ConsentPolicy.normalize(policy.rules[1]) != case.jsonObject.getValue("resolved") }?.let { "$it: normalized differently" } },
				onFailure = { "$name: ${it.message}" },
			)
		}
		assertEquals(emptyList(), problems)
	}

	@Test fun `changing one validity keeps the other prompt's receipt`() {
		val store = C15tStore(InMemoryKeyValueStore())
		assertTrue(boot(store = store).save(CommitIntent.All).ok)
		fun revised(validity: PolicyValidity) =
			ConsentPolicy(policy.rules.map { if (it.id == "everywhere_else") it.copy(validity = validity) else it })
		val noticeOnly = boot(revised(PolicyValidity(noticeDays = 30.0)), store)
		assertTrue(noticeOnly.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(noticeOnly.snapshot().promptRequirement.acknowledge)
		val choiceChanged = boot(revised(PolicyValidity(choiceDays = 30.0, noticeDays = 30.0)), store)
		assertFalse(choiceChanged.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `a refused in-code policy is reported, not started as a quiet deny-all`() {
		val errors = mutableListOf<String>()
		val core = testKernel(
			NativeConfig(null, policyError = "Policy 'x': a partial category scope needs a scopeMode"),
			C15tStore(InMemoryKeyValueStore()), FixedClock(), OfflineTransport, logger = { errors += it.code },
		).also { it.bootstrap() }
		assertTrue(core.snapshot().policyPending)
		assertEquals("policy-invalid", core.snapshot().error?.code)
		assertEquals(listOf("policy-invalid"), errors)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
	}

	@Test fun `a refused policy over a cached one fails closed and keeps the stored choice`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val first = boot(store = store)
		assertTrue(first.save(CommitIntent.All).ok)
		assertTrue(first.isAllowed(ConsentCategory.MEASUREMENT))
		val refused = testKernel(
			NativeConfig(null, policyError = "Policy 'x': a partial category scope needs a scopeMode", consentCategories = ConsentCategory.entries),
			store, FixedClock(), OfflineTransport,
		).also { it.bootstrap() }
		assertTrue(refused.snapshot().policyPending)
		assertEquals("policy-invalid", refused.snapshot().error?.code)
		ConsentCategory.OPTIONAL.forEach { assertFalse(refused.isAllowed(it)) }
		assertTrue(boot(store = store).isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `a refused in-code policy is reported again after reset`() {
		val errors = mutableListOf<String>()
		val core = testKernel(
			NativeConfig(null, policyError = "Policy 'x': a partial category scope needs a scopeMode"),
			C15tStore(InMemoryKeyValueStore()), FixedClock(), OfflineTransport, logger = { errors += it.code },
		).also { it.bootstrap() }
		core.reset()
		assertTrue(core.snapshot().policyPending)
		assertEquals("policy-invalid", core.snapshot().error?.code)
		assertEquals(listOf("policy-invalid", "policy-invalid"), errors)
	}

	@Test fun `bootstrap applies the in-code policy once`() {
		val core = boot()
		val revision = core.snapshot().revision
		core.flushPending()
		assertEquals(revision, core.snapshot().revision)
	}

	@Test fun `every location gets the outcome the backend matcher gives, unmatched ones included`() {
		val problems = fixture.getValue("outcomes").jsonArray.mapNotNull { case ->
			val row = case.jsonObject
			val inputs = row.getValue("inputs").jsonObject
			val expected = row.getValue("expected").jsonObject
			val policy = ConsentPolicy.fromJson(buildJsonObject { put("rules", row.getValue("rules")) }.toString())
			val country = inputs["country"]?.jsonPrimitive?.contentOrNull
			val region = inputs["region"]?.jsonPrimitive?.contentOrNull
			val actual = when (val outcome = policy.outcome(country, region)) {
				is BundledPolicy.MatchOutcome.Matched -> buildJsonObject {
					put("matchedBy", outcome.matchedBy); put("policyId", policy.rules[outcome.index].id); put("status", "matched")
				}
				else -> buildJsonObject {
					put("status", if (outcome is BundledPolicy.MatchOutcome.NoMatch) "no-match" else "failed")
					put("wire", BundledPolicy.unmatchedWire(outcome))
				}
			}
			"${row.getValue("pack").jsonPrimitive.content} $country $region".takeIf { actual != expected }
		}
		assertEquals(emptyList(), problems)
	}

	private fun outcomePolicy(pack: String) = ConsentPolicy.fromJson(buildJsonObject {
		put("rules", fixture.getValue("outcomes").jsonArray.first { it.jsonObject.getValue("pack").jsonPrimitive.content == pack }.jsonObject.getValue("rules"))
	}.toString())

	@Test fun `an unmatched known country runs the safe fallback and drops earlier grants`() {
		val core = boot(outcomePolicy("fallback without a default"), overrides = KernelOverrides(country = "DE"))
		assertEquals("germany", core.snapshot().resolution.policyId)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		core.setOverrides(KernelOverrides(country = "FR"))
		assertEquals("no-match", core.snapshot().resolution.status)
		assertFalse(core.snapshot().policyPending)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		val fresh = boot(outcomePolicy("fallback without a default"), overrides = KernelOverrides(country = "FR"))
		assertEquals("no-match", fresh.snapshot().resolution.status)
		assertTrue(fresh.snapshot().promptRequirement.acknowledge)
	}

	@Test fun `a country that needs a region stays pending instead of taking the default`() {
		val core = boot(outcomePolicy("region rules and a default without a fallback"), overrides = KernelOverrides(country = "US"))
		assertTrue(core.snapshot().policyPending)
		assertEquals("insufficient-inputs", core.snapshot().resolution.reason)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
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
		assertFailsWith<IllegalArgumentException> { ConsentPolicy(listOf(fallback.copy(validity = PolicyValidity(choiceDays = 0.0)))) }
		assertFailsWith<IllegalArgumentException> { NativeConfig("https://consent.example.test", policy = ConsentPolicy(listOf(fallback))) }
		assertFailsWith<IllegalArgumentException> {
			ConsentPolicy.fromJson("""{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","rights":["opt-out"]}]}""")
		}
		assertFailsWith<IllegalArgumentException> {
			ConsentPolicy.fromJson("""{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","categories":["ads"]}]}""")
		}
	}
}
