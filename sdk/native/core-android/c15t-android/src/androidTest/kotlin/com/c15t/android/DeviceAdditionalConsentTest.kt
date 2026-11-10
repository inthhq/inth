@file:Suppress("DEPRECATION")

package com.c15t.android

import android.preference.PreferenceManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.c15t.core.ConsentCore
import com.c15t.core.CommitIntent
import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.model.ConsentSubject
import com.c15t.core.model.KernelUser
import com.c15t.core.model.QueuedSave
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.TcStorageBusKeys
import com.c15t.core.transport.*
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Reads actual default SharedPreferences, backed by the real encrypted platform store. */
@RunWith(AndroidJUnit4::class)
class DeviceAdditionalConsentTest {
	@Before fun prepare() { awaitLaunchSettled(); uninstallCore(); wipeDevice() }
	@After fun cleanup() { uninstallCore(); wipeDevice() }

	private fun wipeDevice() { C15tStores.create(appContext()).clearConsentState() }

	@Test fun testNativeACColdRestoreWithdrawalAndResetInDefaultPreferences() {
		val context = appContext()
		val defaults = PreferenceManager.getDefaultSharedPreferences(context)
		val config = NativeConfig("https://consent.instrumentation.invalid",
			iab = IabConfiguration(53, 7, "GB"))
		val backend = NativeIabDeviceBackend()
		val first = ConsentCore(config, C15tStores.create(context), clock = Clock { DEVICE_IAB_NOW },
			transport = backend, executor = TaskExecutor.DIRECT)
		first.bootstrap()
		assertTrue(first.save(CommitIntent.All).ok)
		assertEquals("2~1.10~dv.", defaults.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		assertTrue(defaults.all[TcStorageBusKeys.ADDTL_CONSENT] is String)
		val before = first.iabConsent!!
		assertEquals(before.tcString, defaults.getString(TcStorageBusKeys.TC_STRING, null))
		defaults.edit().remove(TcStorageBusKeys.ADDTL_CONSENT).commit()
		val cold = ConsentCore(config, C15tStores.create(context), clock = Clock { DEVICE_IAB_NOW },
			transport = backend, executor = TaskExecutor { })
		cold.bootstrap()
		assertEquals(before, cold.iabConsent)
		assertEquals(before.addtlConsent, defaults.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		assertTrue(cold.save(CommitIntent.Necessary).ok)
		assertEquals("2~~dv.1.10", defaults.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		cold.identify(KernelUser("next-user"))
		assertNull(defaults.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		cold.reset()
		assertNull(defaults.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
	}
}

internal const val DEVICE_IAB_NOW = 1_758_100_000_000L

/** Test-only explicit identity and scoped Google examples. Never production defaults. */
internal class NativeIabDeviceBackend : C15tTransport {
	override fun init(context: InitContext): TransportOutcome = TransportOutcome.Success(Json.parseToJsonElement(INIT), emptyMap())
	override fun save(entry: QueuedSave): SaveOutcome = SaveOutcome.Unavailable("device test offline")
	override fun identify(subject: ConsentSubject, user: KernelUser): TransportOutcome = TransportOutcome.NetworkFailure("offline")
	override fun logout(subject: ConsentSubject): TransportOutcome = TransportOutcome.NetworkFailure("offline")

	companion object {
		val INIT = """{
		  "policyResolution":{"version":1,"status":"matched","policyId":"mobile-iab","matchedBy":"country",
			"fingerprints":{"policy":"mobile-policy","choice":"mobile-choice","notice":"mobile-notice"},
			"policy":{"id":"mobile-iab","model":"iab","prompt":"choice","scopeMode":"permissive",
			  "validity":{"choiceMs":2592000000,"noticeMs":2592000000}}},
		  "gvl":{"vendorListVersion":42,"tcfPolicyVersion":5,"gvlSpecificationVersion":3,"lastUpdated":"2025-09-17T00:00:00Z",
			"purposes":{"1":{"id":1,"name":"Storage","description":"Storage"},"3":{"id":3,"name":"Profiles","description":"Profiles"},"4":{"id":4,"name":"Ads","description":"Ads"}},
			"vendors":{"1":{"id":1,"name":"Test vendor","purposes":[1,3,4]}},
			"specialPurposes":{},"specialFeatures":{},"features":{},"stacks":{},
			"standardTexts":{"features":"Features explanation"}},
		  "adTechProviders":[{"id":1,"name":"Google example 1","policyUrl":"https://one.example/privacy"},{"id":10,"name":"Google example 10","policyUrl":"https://ten.example/privacy"}]
		}"""
	}
}
