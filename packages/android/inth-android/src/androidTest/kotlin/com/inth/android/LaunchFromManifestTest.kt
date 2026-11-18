package com.inth.android

import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.inth.core.Inth
import com.inth.core.CommitIntent
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The launch path, on a device, with no React Native and no JavaScript in the process.
 *
 * This is the native-before-JavaScript gate from issue 1010 stated as a test: an analytics or
 * ad SDK initialised inside `Application.onCreate` has to get a real answer out of Inth before
 * the bundle exists. Everything here reads the manifest the merger and the resource compiler
 * actually built into the instrumented APK, so the values reach the SDK through `PackageManager`
 * the way a host app's do.
 *
 * Test methods are named `test<Behaviour>` rather than in backticks because DEX 039, which is
 * what minSdk 24 dexes to, refuses a space in a method name. The behaviour each one protects is
 * the first line of its KDoc, which is the shape `packages/react-native/ios/Tests` already uses.
 */
@RunWith(AndroidJUnit4::class)
class LaunchFromManifestTest {
	@Before
	fun startFromAnUninstalledCore() {
		awaitLaunchSettled()
		uninstallCore()
	}

	@After
	fun leaveNoCoreInstalled() {
		uninstallCore()
	}

	/** `configFrom` reads the merged manifest, whichever type the manifest parser chose. */
	@Test
	fun testConfigFromReadsTheMergedManifest() {
		val declared = InthAndroid.configFrom(appContext())

		assertNotNull("the instrumented APK declares com.inth.BACKEND_URL", declared)
		val config = requireNotNull(declared)
		assertEquals("https://consent.instrumentation.invalid", config.backendUrl)
		assertTrue("the debuggable test APK declares com.inth.DRY_RUN", config.dryRun)
		assertEquals("consent.instrumentation.invalid", config.domain)
		// The manifest spells this one unquoted, so the parser hands over a Boolean. A reader
		// built on `getString` plus `toBooleanStrictOrNull` would still see it, and would then
		// answer "not declared" for the `TRUE` and `1` spellings of the same switch.
		assertEquals(true, config.detectedGpc)
		assertEquals(
			"the declared scope reaches the config in declared order, with the unknown name dropped",
			listOf(
				ConsentCategory.NECESSARY,
				ConsentCategory.FUNCTIONALITY,
				ConsentCategory.MEASUREMENT,
				ConsentCategory.MARKETING,
			),
			config.consentCategories,
		)
	}

	/** The built APK registers `InthInitializer` with androidx.startup, so the launch hook runs. */
	@Test
	fun testBuiltApkRegistersTheInitializerWithAndroidxStartup() {
		val context = appContext()

		val provider = context.packageManager.getProviderInfo(
			ComponentName(context.packageName, INITIALIZATION_PROVIDER),
			PackageManager.GET_META_DATA,
		)

		assertFalse("the launch hook belongs to this process alone", provider.exported)
		assertEquals(
			"the merged manifest has to name InthInitializer, or androidx.startup never calls it",
			"androidx.startup",
			InthManifestValue.string(InthManifestValue.raw(provider.metaData, InthInitializer::class.java.name)),
		)
	}

	/**
	 * The Initializer answers a native SDK's reads with no JavaScript runtime in the process.
	 *
	 * Nothing here imports React Native, loads a bundle, or starts a bridge: this is the state
	 * an ad SDK sees from its own init on a device that has never run JavaScript.
	 */
	@Test
	fun testInitializerAnswersNativeReadsWithoutAnyJavaScriptRuntime() {
		val context = appContext()

		InthInitializer().create(context)

		assertNotNull("the Initializer installs the core, which is the whole zero-code path", Inth.current)
		assertTrue(ConsentCategory.NECESSARY.wireName, Inth.isAllowed(ConsentCategory.NECESSARY))
		assertFalse("nothing has resolved, so an optional category stays off", Inth.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(ConsentDecision.PENDING, Inth.decision(ConsentCategory.MEASUREMENT))
		assertFalse("an unresolved policy is not an answer", Inth.isReady())
		assertTrue(Inth.snapshot().policyPending)
		assertNull(
			"the answer above came from a process with React Native absent from it",
			classOrNull("com.facebook.react.bridge.ReactApplicationContext"),
		)
	}

	/** A second install is ignored rather than replacing a core that is already running. */
	@Test
	fun testSecondInstallIsIgnoredRatherThanReplacingTheRunningCore() {
		val context = appContext()
		val running = DeviceBackend()
		InthAndroid.install(context, deviceConfig(), transport = running)
		val installed = Inth.current
		assertNotNull("the first install must install", installed)

		// A host that calls install from Application.onCreate while the Initializer already
		// ran: the documented shape, and the one that would swap a live kernel if idempotence
		// were the caller's rather than the core's.
		val latecomer = DeviceBackend(initiallyOnline = true)
		InthAndroid.install(
			context,
			deviceConfig().copy(backendUrl = "https://elsewhere.instrumentation.invalid"),
			transport = latecomer,
		)

		assertSame("a second install must not swap a running core", installed, Inth.current)
		running.online = true
		assertTrue(Inth.save(CommitIntent.All).ok)
		awaitSettled("the running core to keep serving writes") { running.accepted().isNotEmpty() }
		assertEquals(
			"the discarded core must never touch the backend it was built with",
			0,
			latecomer.initCount(),
		)
		assertTrue("and no write reached it either", latecomer.accepted().isEmpty())
	}

	/**
	 * A host that declared no backend URL leaves the core uninstalled, and reads keep answering.
	 *
	 * Two spellings of "declared nothing" go through the real package manager, because they are
	 * the two ways out of `configFrom`: an application declaration that exists and names nothing
	 * Inth, and a declaration the platform cannot find at all. Both have to end in the same
	 * place, which is no core installed and the deny-all answer, rather than a throw in a launch
	 * hook that runs before the first Activity exists.
	 */
	@Test
	fun testUndeclaredBackendUrlLeavesTheCoreUninstalledAndReadsStillAnswer() {
		val context = appContext()

		for (host in listOf(declaresNothingInth(context), declaresNothingAtAll(context))) {
			assertNull("${host.packageName} declares nothing usable", InthAndroid.configFrom(host))
			InthAndroid.bootstrap(host)
			assertNull("${host.packageName} leaves the core uninstalled", Inth.current)
		}

		assertTrue(Inth.isAllowed(ConsentCategory.NECESSARY))
		assertFalse(Inth.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(ConsentDecision.PENDING, Inth.decision(ConsentCategory.MEASUREMENT))
		assertFalse(Inth.isReady())
		assertFalse("an uninstalled core never hydrated", Inth.hasStoredSnapshot)
		assertTrue(Inth.snapshot().policyPending)

		val refused = Inth.save(CommitIntent.All)
		assertFalse("a write is a no-op rather than an exception", refused.ok)
		assertEquals("not-bootstrapped", refused.error?.code)

		// Registration against nothing is one answer, never silence, or a host that switched
		// itself off would wait for a change that cannot come.
		var seen: ConsentDecision? = null
		val handle = Inth.gateDecision(ConsentCategory.MEASUREMENT) { decision -> seen = decision }
		assertEquals(ConsentDecision.PENDING, seen)
		handle.close()
	}

	/**
	 * A host whose application declaration exists and names nothing Inth.
	 *
	 * `configFrom` asks the package manager about `context.packageName`, and the framework
	 * package is on every device with a declaration of its own that carries no Inth keys. The
	 * wrapper is how that second declaration reaches the SDK: `createPackageContext("android")`
	 * hands back a context that still reports the caller's own package, which this suite found
	 * out on the device rather than from the documentation.
	 */
	private fun declaresNothingInth(context: Context): Context = hostReporting(context, FRAMEWORK_PACKAGE)

	/** A package the platform cannot resolve, which is the other way `configFrom` runs out. */
	private fun declaresNothingAtAll(context: Context): Context = hostReporting(context, UNRESOLVABLE_PACKAGE)

	private fun hostReporting(
		context: Context,
		reportedPackage: String,
	): Context = object : ContextWrapper(context) {
		override fun getPackageName(): String = reportedPackage
	}

	private fun classOrNull(name: String): String? = try {
		Class.forName(name).name
	} catch (_: ClassNotFoundException) {
		null
	}

	private companion object {
		const val INITIALIZATION_PROVIDER = "androidx.startup.InitializationProvider"
		const val FRAMEWORK_PACKAGE = "android"
		const val UNRESOLVABLE_PACKAGE = "com.inth.no.such.app"
	}
}
