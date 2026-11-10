package com.c15t.android

import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.c15t.core.C15t
import com.c15t.core.ConsentCore
import com.c15t.core.ConsentPolicy
import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.KernelError
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.transport.C15tTransport
import com.c15t.core.transport.HostedTransport
import com.c15t.core.transport.OfflineTransport
import java.util.Locale
import java.util.concurrent.Executors

/**
 * The Android wiring, kept separate from the engine so the engine stays testable
 * without a device.
 *
 * Everything a host has to do is either declare its backend in the manifest and let
 * [C15tInitializer] run, or call [install] itself from `Application.onCreate`.
 */
object C15tAndroid {
	private const val TAG = "c15t"

	/** Manifest keys the Initializer reads; the app declares these. */
	const val META_BACKEND_URL = "com.c15t.BACKEND_URL"

	const val META_BUNDLED_POLICY = "com.c15t.POLICY_RESOURCE"

	/**
	 * `offline` selects no-backend mode: the core starts without [META_BACKEND_URL] and
	 * sends nothing. Absent, the mode is backend mode, which needs [META_BACKEND_URL].
	 */
	const val META_MODE = "com.c15t.MODE"

	/** The [META_MODE] value for no-backend mode. */
	const val MODE_OFFLINE = "offline"

	/**
	 * Asset path of the in-code policy, `{"rules": [...]}` in the backend's `PolicyRule`
	 * names. Read only in no-backend mode, where it is the only policy source.
	 */
	const val META_POLICY_RULES = "com.c15t.POLICY_RULES"

	const val META_BACKEND_INIT_URL = "com.c15t.BACKEND_INIT_URL"
	const val META_BACKEND_DOMAIN = "com.c15t.BACKEND_DOMAIN"

	/**
	 * Comma-separated category ids the app offers, e.g.
	 * `necessary, functionality, measurement, marketing`. This is the Android
	 * spelling of the `consentCategories` a web host passes to its provider, and
	 * iOS reads the same declaration from the `com.c15t.categories` plist array.
	 */
	const val META_CATEGORIES = "com.c15t.CATEGORIES"

	@Volatile
	private var foregroundObserver: C15tForegroundObserver? = null

	@Volatile
	private var reachability: C15tReachability? = null

	private val background = Executors.newSingleThreadExecutor { runnable ->
		Thread(runnable, "c15t-io").apply { isDaemon = true }
	}

	/**
	 * The worker every core [install] starts runs its init and delivery on.
	 *
	 * Internal so an instrumented test that bootstraps a core by hand can put it on the same
	 * worker, where [awaitWorkerIdle] reaches its work.
	 */
	internal val worker = TaskExecutor { task -> background.execute(task) }

	/**
	 * Build the platform capabilities, install them, and start the core.
	 *
	 * Idempotent through [C15t.bootstrap], so it is safe to call from both an
	 * initializer and application code.
	 *
	 * @param transport override the backend transport, for a host that proxies
	 * c15t through its own HTTP stack. Without one, a config with no backend URL gets
	 * [OfflineTransport].
	 * @param observeForeground register the process-foreground observer that replays
	 * the offline queue. Turn it off only if the host drives [C15t.flushPending] and
	 * [C15t.refresh] itself.
	 * @param observeReachability replay the queue and refresh policy when connectivity returns.
	 * This one needs `android.permission.ACCESS_NETWORK_STATE`, which belongs to the
	 * host: without it the registration is refused and c15t carries on with the launch
	 * and foreground replays, so declaring it buys a faster retry rather than correctness.
	 * @return The installed core. A repeated call returns the core already installed.
	 */
	fun install(
		context: Context,
		config: NativeConfig,
		transport: C15tTransport? = null,
		clock: Clock = Clock.SYSTEM,
		observeForeground: Boolean = true,
		observeReachability: Boolean = true,
		logger: (KernelError) -> Unit = { error -> Log.w(TAG, "${error.code}: ${error.message}") },
	): ConsentCore {
		val appContext = context.applicationContext
		val store = C15tStores.create(appContext)
		val http = transport ?: if (config.backendUrl == null) OfflineTransport else HostedTransport(C15tHttpClient(), config)

		// One executor for both the core and the observer registered below, so the launch
		// replay and the foreground replay cannot deliver the same queued entry twice.
		val executor = worker

		val core = C15t.bootstrap(
			config = config,
			store = store,
			clock = clock,
			transport = http,
			executor = executor,
			logger = logger,
		)

		if (observeForeground && foregroundObserver == null) {
			onMainThread {
				val observer = C15tForegroundObserver(executor)
				foregroundObserver = observer
				androidx.lifecycle.ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
			}
		}

		if (observeReachability && reachability == null) {
			onMainThread {
				if (reachability == null) {
					reachability = C15tReachability.register(appContext) { onNetworkGained(executor) }
				}
			}
		}
		return core
	}

	/**
	 * Block until every task already handed to the shared worker has run.
	 *
	 * [C15t.uninstall] drops a kernel without cancelling the init and replay it queued here, and
	 * that work still writes to the same files. A test that installs the next core straight
	 * after a reset waits on this first, so the dropped core cannot land a write in the next
	 * test's store.
	 */
	internal fun awaitWorkerIdle() {
		background.submit {}.get()
	}

	internal fun onNetworkGained(executor: TaskExecutor) {
		executor.execute { C15t.flushPending() }
		C15t.refresh()
	}

	/**
	 * Start c15t from manifest metadata, the zero-code path.
	 *
	 * Without `com.c15t.BACKEND_URL`, and without `com.c15t.MODE` set to `offline`, there
	 * is nothing to start, so this logs and leaves the core uninstalled: reads still answer
	 * deny-all, which is the safe state for a misconfigured build rather than a crash at
	 * startup.
	 */
	fun bootstrap(context: Context) {
		val config = configFrom(context)
		if (config == null) {
			Log.i(TAG, "no $META_BACKEND_URL meta-data and no $META_MODE=$MODE_OFFLINE declared; c15t stays inactive until C15tAndroid.install")
			return
		}
		install(context, config)
	}

	/** Read the declared configuration, or `null` when nothing usable is declared. */
	fun configFrom(context: Context): NativeConfig? {
		val bundle = try {
			context.packageManager
				.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
				.metaData
		} catch (error: PackageManager.NameNotFoundException) {
			null
		} ?: return null

		return configFrom(
			read = { key -> C15tManifestValue.raw(bundle, key) },
			readAsset = { name ->
				try { context.assets.open(name).bufferedReader().use { it.readText() } }
				catch (error: java.io.IOException) { Log.w(TAG, "Cannot read bundled policy $name", error); null }
			},
		)
	}

	/**
	 * Build the configuration from raw meta-data values, so the mapping is testable
	 * without a device.
	 *
	 * @param read returns the raw bundle entry for a key, typically `bundle.get(key)`.
	 * @param readAsset returns the text of a bundled asset, or `null` when it is unreadable.
	 */
	internal fun configFrom(read: (String) -> Any?, readAsset: (String) -> String?): NativeConfig? {
		// Every value goes through `C15tManifestValue`, which reads whichever type the
		// manifest parser chose. A hand-edited manifest and an Expo-generated one do not
		// arrive as the same Java type, and a reader that names one of them honours only
		// the app that happened to spell it that way.
		// The two modes do not mix. No-backend mode reads no backend URL and no bundled
		// manifest, so a stray key from an earlier backend build cannot bring either back.
		val offline = C15tManifestValue.string(read(META_MODE))?.trim()?.lowercase(Locale.ROOT) == MODE_OFFLINE
		val backendUrl = if (offline) null else C15tManifestValue.string(read(META_BACKEND_URL)) ?: return null
		if (offline && read(META_BACKEND_URL) != null) {
			Log.w(TAG, "$META_MODE=$MODE_OFFLINE ignores $META_BACKEND_URL and $META_BUNDLED_POLICY")
		}
		// Absent stays absent. `false` is an answer and a missing key is not, and the
		// core treats them differently when it derives the signal.
		return NativeConfig(
			backendUrl = backendUrl,
			bundledPolicy = if (offline) null else C15tManifestValue.string(read(META_BUNDLED_POLICY))?.let(readAsset),
			policy = if (offline) C15tManifestValue.string(read(META_POLICY_RULES))?.let(readAsset)?.let(::policyFrom) else null,
			initUrl = if (offline) null else C15tManifestValue.string(read(META_BACKEND_INIT_URL)),
			domain = C15tManifestValue.string(read(META_BACKEND_DOMAIN)),
			consentCategories = declaredCategories(read(META_CATEGORIES)),
			vendors = declaredVendors(read(META_VENDORS)),
			iab = when (val declared = declaredIab(read)) {
				is DeclaredIab.Valid -> declared.configuration
				is DeclaredIab.Invalid -> {
					// Refuse IAB, not the whole core: category consent still works, and no
					// CMP ID reaches IABTCF_* that the publisher did not declare correctly.
					Log.e(TAG, "IAB meta-data refused: ${declared.reason} c15t starts without IAB TCF, " +
						"so no IABTCF_CmpSdkID is written and IAB saves fail until the com.c15t.IAB_* keys are fixed.")
					null
				}
				DeclaredIab.None -> null
			},
			detectedGpc = C15tManifestValue.boolean(read(META_GPC)),
		)
	}

	/**
	 * Parse the in-code policy asset. A broken file is logged and leaves the core without
	 * a policy, so optional categories stay denied rather than the app crashing at launch.
	 */
	private fun policyFrom(json: String): ConsentPolicy? = try {
		ConsentPolicy.fromJson(json)
	} catch (error: Exception) {
		Log.e(TAG, "$META_POLICY_RULES refused: ${error.message}. c15t starts with no policy and denies optional categories.")
		null
	}

	/** The outcome of reading the `com.c15t.IAB_*` meta-data. */
	internal sealed interface DeclaredIab {
		/** No IAB key is declared, so IAB TCF stays off. */
		data object None : DeclaredIab

		data class Valid(val configuration: IabConfiguration) : DeclaredIab

		/** Something was declared, but not a usable CMP identity. */
		data class Invalid(val reason: String) : DeclaredIab
	}

	/**
	 * Read the IAB settings a host declared.
	 *
	 * No `com.c15t.IAB_*` key means IAB stays off. Once any of them is present, CMP ID,
	 * CMP version and publisher country code are all required and must be in the ranges
	 * the core enforces. A declaration that fails is refused whole, so the core never
	 * writes a CMP ID the publisher did not register. There is no default CMP ID.
	 *
	 * @param read returns the raw bundle entry for a key, typically `bundle.get(key)`.
	 */
	internal fun declaredIab(read: (String) -> Any?): DeclaredIab {
		val keys = listOf(META_IAB_CMP_ID, META_IAB_CMP_VERSION, META_IAB_PUBLISHER_COUNTRY_CODE, META_IAB_CONSENT_SCREEN)
		if (keys.all { read(it) == null }) return DeclaredIab.None
		fun integer(key: String): Int? = C15tManifestValue.string(read(key))?.toIntOrNull()

		val cmpId = integer(META_IAB_CMP_ID)
		if (cmpId == null || cmpId !in 2..4095) {
			return DeclaredIab.Invalid("$META_IAB_CMP_ID must be your registered CMP ID, a whole number from 2 to 4095.")
		}
		val cmpVersion = integer(META_IAB_CMP_VERSION)
		if (cmpVersion == null || cmpVersion !in 0..4095) {
			return DeclaredIab.Invalid("$META_IAB_CMP_VERSION must be a whole number from 0 to 4095.")
		}
		val country = C15tManifestValue.string(read(META_IAB_PUBLISHER_COUNTRY_CODE))?.uppercase(Locale.ROOT)
		if (country == null || country.length != 2 || !country.all { it in 'A'..'Z' }) {
			return DeclaredIab.Invalid("$META_IAB_PUBLISHER_COUNTRY_CODE must be a two-letter country code.")
		}
		val consentScreen = if (read(META_IAB_CONSENT_SCREEN) == null) 1 else integer(META_IAB_CONSENT_SCREEN)
		if (consentScreen == null || consentScreen !in 0..63) {
			return DeclaredIab.Invalid("$META_IAB_CONSENT_SCREEN must be a whole number from 0 to 63.")
		}
		return DeclaredIab.Valid(
			IabConfiguration(
				cmpId = cmpId,
				cmpVersion = cmpVersion,
				publisherCountryCode = country,
				consentScreen = consentScreen,
			),
		)
	}

	/** IAB Europe CMP ID, 2 to 4095. Required when any `com.c15t.IAB_*` key is present. */
	const val META_IAB_CMP_ID = "com.c15t.IAB_CMP_ID"

	/** Your CMP version, 0 to 4095. Required with [META_IAB_CMP_ID]. */
	const val META_IAB_CMP_VERSION = "com.c15t.IAB_CMP_VERSION"

	/** Two-letter publisher country code. Required with [META_IAB_CMP_ID]. */
	const val META_IAB_PUBLISHER_COUNTRY_CODE = "com.c15t.IAB_PUBLISHER_COUNTRY_CODE"

	/** Optional consent screen number, 0 to 63. The core's default is 1. */
	const val META_IAB_CONSENT_SCREEN = "com.c15t.IAB_CONSENT_SCREEN"

	/**
	 * Parse a declared category scope from manifest text.
	 *
	 * The value is a comma-separated list of category ids. Spaces around a name
	 * are decoration; a name neither core knows is dropped rather than trusted,
	 * the same call the iOS plist reader makes about an unknown raw value, so a
	 * typo narrows the rows instead of installing a category that cannot exist.
	 * `necessary` in the list is harmless: the kernel lists it whatever the
	 * declaration says, and the declaration only ever narrows the optional set.
	 *
	 * @param raw the raw bundle entry, typically `bundle.get(key)`.
	 * @return the declared categories in declaration order, or `null` when
	 *   nothing usable is declared, which tells the core to offer the full
	 *   policy scope.
	 */
	fun declaredCategories(raw: Any?): List<ConsentCategory>? =
		C15tManifestValue.string(raw)
			?.split(',')
			?.mapNotNull { ConsentCategory.fromWireName(it.trim()) }
			?.takeIf { it.isNotEmpty() }

	/**
	 * Parse a declared vendor scope from manifest text.
	 *
	 * The value is a comma-separated list of IAB vendor ids. Spaces around an id are decoration, and
	 * an entry that is not a positive whole number is dropped rather than trusted -- the same call
	 * [declaredCategories] makes about a name neither core knows, so a typo in an id cannot install a
	 * disclosure the framework never assigned. Duplicates are dropped here rather than carried: the
	 * request half sorts and dedupes anyway, and a device that stored the same id twice would report a
	 * scope longer than the publisher's partner list.
	 *
	 * An id the served list does not carry stays in the declaration and costs nothing, because pruning
	 * a served document never adds an entry to satisfy a scope. That is the point of reading ids here
	 * instead of resolving them: nothing this key declares has to be verifiable at launch.
	 *
	 * @param raw the raw bundle entry, typically `bundle.get(key)`.
	 * @return the declared ids in declaration order and without repeats, or `null` when nothing usable
	 *   is declared, which tells the core to keep every vendor it is served.
	 */
	fun declaredVendors(raw: Any?): List<Int>? =
		C15tManifestValue.string(raw)
			?.split(',')
			?.mapNotNull { entry -> entry.trim().toIntOrNull()?.takeIf { it > 0 } }
			?.distinct()
			?.takeIf { it.isNotEmpty() }

	/** Manifest key that forces GPC on for a staged build. */
	const val META_GPC = "com.c15t.FORCE_GPC"

	/**
	 * Comma-separated IAB vendor ids the app declares, e.g. `42, 755, 8`. This is the Android
	 * spelling of the `iab.vendors` array a web host passes to its provider, and iOS reads the same
	 * declaration from the `com.c15t.vendors` plist string.
	 *
	 * The device half of the declaration -- prune the list the core holds -- is what carries the
	 * disclosure promise, and it runs whatever this key says. The request half travels to the backend
	 * as `x-c15t-vendors`, which is an optimisation about bytes: an unusable entry here costs a
	 * slightly wider request, not a wider disclosure, and a declaration too long to fit on the request
	 * line is sent as no header at all.
	 *
	 * Absent and empty both read as "declare nothing", which keeps every served vendor. A host that
	 * means no vendors has to say so with a scope that names none, not by leaving this key out.
	 */
	const val META_VENDORS = "com.c15t.VENDORS"

	private fun onMainThread(block: () -> Unit) {
		if (Looper.myLooper() == Looper.getMainLooper()) {
			block()
		} else {
			Handler(Looper.getMainLooper()).post(block)
		}
	}
}
