@file:Suppress("DEPRECATION")

package com.c15t.android

import android.content.SharedPreferences
import android.preference.PreferenceManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.spi.*
import com.c15t.core.store.*
import com.c15t.core.tc.TcStringDecoder
import com.c15t.core.transport.*
import kotlinx.serialization.json.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceCompleteStorageBusTest {
	@Before fun prepare() { awaitLaunchSettled(); uninstallCore(); C15tStores.create(appContext()).clearConsentState() }
	@After fun cleanup() { uninstallCore(); C15tStores.create(appContext()).clearConsentState() }

	@Test fun allTypedRowsRestoreBeforeJSAndWithdrawalClearsGrants() {
		val context = appContext()
		val prefs = PreferenceManager.getDefaultSharedPreferences(context)
		val config = NativeConfig("https://consent.instrumentation.invalid", iab = IabConfiguration(53, 7, "GB",
			numCustomPurposes = 2, publisherRestrictions = listOf(IabPublisherRestriction(3, 0, listOf(1)))))
		val first = C15tKernel(config, C15tStores.create(context), clock = Clock { DEVICE_IAB_NOW },
			transport = NativeIabDeviceBackend(), executor = TaskExecutor.DIRECT)
		first.bootstrap()
		assertEquals(53, prefs.getInt(TcStorageBusKeys.CMP_SDK_ID, -1))
		assertTrue(first.save(CommitIntent.All).ok)
		val saved = first.iabConsent!!
		val decoded = TcStringDecoder.decode(saved.tcString)
		val numeric = listOf(TcStorageBusKeys.CMP_SDK_ID, TcStorageBusKeys.CMP_SDK_VERSION,
			TcStorageBusKeys.POLICY_VERSION, TcStorageBusKeys.GDPR_APPLIES,
			TcStorageBusKeys.PURPOSE_ONE_TREATMENT, TcStorageBusKeys.USE_NON_STANDARD_TEXTS)
		for (key in numeric) assertTrue("$key must be Int", prefs.all[key] is Int)
		for (key in TcStorageBusKeys.ALL_NAMES.filter { it in prefs.all && it !in numeric })
			assertTrue("$key must be String", prefs.all[key] is String)
		assertEquals(7, prefs.getInt(TcStorageBusKeys.CMP_SDK_VERSION, -1))
		assertEquals(1, prefs.getInt(TcStorageBusKeys.GDPR_APPLIES, -1))
		assertEquals("GB", prefs.getString(TcStorageBusKeys.PUBLISHER_CC, null))
		assertEquals("101100000000000000000000", prefs.getString(TcStorageBusKeys.PURPOSE_CONSENTS, null))
		assertEquals("1", prefs.getString(TcStorageBusKeys.VENDOR_CONSENTS, null))
		assertFalse(first.isIabAllowed(1, 3, IabLegalBasis.CONSENT))
		assertEquals("1", prefs.getString(TcStorageBusKeys.DISCLOSED_VENDORS, null))
		assertEquals("0", prefs.getString(TcStorageBusKeys.PUBLISHER_RESTRICTIONS + "3", null))
		assertEquals("11", prefs.getString(TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_CONSENTS, null))
		assertEquals("11", prefs.getString(TcStorageBusKeys.PUBLISHER_CUSTOM_PURPOSES_LEGITIMATE_INTERESTS, null))
		assertEquals(decoded.core.cmpId, prefs.getInt(TcStorageBusKeys.CMP_SDK_ID, -1))
		assertEquals(saved.tcString, prefs.getString(TcStorageBusKeys.TC_STRING, null))
		val before = prefs.all.filterKeys { it in TcStorageBusKeys.ALL_NAMES }
		prefs.edit().remove(TcStorageBusKeys.PURPOSE_CONSENTS).putString(TcStorageBusKeys.PUBLISHER_RESTRICTIONS + "7", "2").commit()
		val cold = C15tKernel(config, C15tStores.create(context), clock = Clock { DEVICE_IAB_NOW }, executor = TaskExecutor { })
		cold.bootstrap()
		assertEquals(before, prefs.all.filterKeys { it in TcStorageBusKeys.ALL_NAMES })
		assertTrue(cold.save(CommitIntent.Necessary).ok)
		assertEquals("000000000000000000000000", prefs.getString(TcStorageBusKeys.PURPOSE_CONSENTS, null))
		assertEquals("2~~dv.1.10", prefs.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		cold.reset()
		assertNull(prefs.getString(TcStorageBusKeys.TC_STRING, null))
		assertNull(prefs.getString(TcStorageBusKeys.PUBLISHER_RESTRICTIONS + "3", null))
		assertEquals(53, prefs.getInt(TcStorageBusKeys.CMP_SDK_ID, -1))
	}

	@Test fun rejectedPreferenceTransactionClearsMarkersAndNextPublicationRepairsActualStore() {
		val real = PreferenceManager.getDefaultSharedPreferences(appContext())
		val rejecting = RejectingPreferences(real)
		val bus = DefaultPreferencesTcStorageBus(rejecting)
		val values = mapOf(TcStorageBusKeys.CMP_SDK_ID to TcBusValue.NumberValue(53),
			TcStorageBusKeys.TC_STRING to TcBusValue.TextValue("new-tc"),
			TcStorageBusKeys.PURPOSE_CONSENTS to TcBusValue.TextValue("101"),
			TcStorageBusKeys.ADDTL_CONSENT to TcBusValue.TextValue("2~1~dv."),
			TcStorageBusKeys.PUBLISHER_RESTRICTIONS + "2" to TcBusValue.TextValue("_1"))
		rejecting.failOnce = true
		bus.write(values)
		assertNull(real.getString(TcStorageBusKeys.TC_STRING, null))
		assertNull(real.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		assertNull(real.getString(TcStorageBusKeys.PURPOSE_CONSENTS, null))
		bus.write(values)
		assertEquals("new-tc", real.getString(TcStorageBusKeys.TC_STRING, null))
		assertEquals("101", real.getString(TcStorageBusKeys.PURPOSE_CONSENTS, null))
		assertEquals("_1", real.getString(TcStorageBusKeys.PUBLISHER_RESTRICTIONS + "2", null))
		bus.clear()
		for (key in TcStorageBusKeys.ALL_NAMES) assertFalse("$key survived clear", real.contains(key))
	}

	@Test fun rejectedCoreCommitKeepsActualPreferencesAndExpiredRestartCannotRestoreIt() {
		val context = appContext()
		val prefs = PreferenceManager.getDefaultSharedPreferences(context)
		val backend = RejectingCoreStore()
		val config = NativeConfig("https://consent.instrumentation.invalid", iab = IabConfiguration(53, 7, "GB"))
		var now = DEVICE_IAB_NOW
		fun store() = C15tStore(backend, tcStorageBus = DefaultPreferencesTcStorageBus(context))
		val core = C15tKernel(config, store(), clock = Clock { now }, transport = NativeIabDeviceBackend(), executor = TaskExecutor.DIRECT)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val before = prefs.all.filterKeys { it in TcStorageBusKeys.ALL_NAMES }
		val record = backend.read(C15tStoreKeys.SNAPSHOT)
		backend.reject = true
		assertFalse(core.save(CommitIntent.Necessary).ok)
		assertEquals(before, prefs.all.filterKeys { it in TcStorageBusKeys.ALL_NAMES })
		assertEquals(record, backend.read(C15tStoreKeys.SNAPSHOT))
		now += 8 * 86_400_000L
		val cold = C15tKernel(config, store(), clock = Clock { now }, executor = TaskExecutor { })
		cold.bootstrap()
		assertNull(prefs.getString(TcStorageBusKeys.TC_STRING, null))
		assertNull(prefs.getString(TcStorageBusKeys.ADDTL_CONSENT, null))
		assertEquals(53, prefs.getInt(TcStorageBusKeys.CMP_SDK_ID, -1))
		cold.rebuildTcStorageBus()
		assertNull(prefs.getString(TcStorageBusKeys.TC_STRING, null))
	}

	private class RejectingCoreStore : KeyValueStore {
		val values = mutableMapOf<String, String>()
		var reject = false
		override fun read(key: String) = values[key]
		override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
		override fun writeDurably(key: String, value: String?): Boolean {
			if (reject) return false
			write(key, value)
			return true
		}
	}

	/** Simulates commit() updating the real in-memory map before reporting disk rejection. */
	private class RejectingPreferences(private val real: SharedPreferences) : SharedPreferences by real {
		var failOnce = false
		override fun edit(): SharedPreferences.Editor {
			val editor = real.edit()
			return object : SharedPreferences.Editor by editor {
				override fun commit(): Boolean {
					val committed = editor.commit()
					if (!failOnce) return committed
					failOnce = false
					return false
				}
			}
		}
	}
}
