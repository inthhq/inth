package com.c15t.android

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.c15t.core.C15t
import com.c15t.core.C15tInternalApi
import com.c15t.core.ConsentCore
import com.c15t.core.ConsentPolicy
import com.c15t.core.InthProjectUrl
import com.c15t.core.NativeConfig
import com.c15t.core.gpp.GppMspaMode
import com.c15t.core.gpp.GppOptions
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.KernelError
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.transport.C15tTransport
import com.c15t.core.transport.HostedTransport
import java.util.Locale
import java.util.concurrent.Executors

/**
 * The Android wiring, kept separate from the engine so the engine stays testable
 * without a device.
 *
 * Everything a host has to do is either declare its Inth project URL in the manifest
 * and let [C15tInitializer] run, or call [install] itself from `Application.onCreate`.
 */
object C15tAndroid {
	private const val TAG = "c15t"

	/** Manifest keys the Initializer reads; the app declares these. */
	const val META_BACKEND_URL = "com.c15t.BACKEND_URL"

	const val META_BUNDLED_POLICY = "com.c15t.POLICY_RESOURCE"

	/**
	 * `true` turns on `NativeConfig.dryRun`: consent works on the device and no record
	 * is sent. For development and CI. A build that is not debuggable refuses it.
	 */
	const val META_DRY_RUN = "com.c15t.DRY_RUN"

	/**
	 * Asset path of the in-code policy, `{"rules": [...]}` in the backend's `PolicyRule`
	 * names. With it the device resolves the policy and never calls `/init`.
	 */
	const val META_POLICY_RULES = "com.c15t.POLICY_RULES"

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
	 * Idempotent, so it is safe to call from both an initializer and application code.
	 *
	 * @param config `backendUrl` is the project URL from the Inth dashboard, such as
	 * `https://your-project.inth.app`.
	 * @param observeForeground register the process-foreground observer that replays
	 * the offline queue. Turn it off only if the host drives [C15t.flushPending] and
	 * [C15t.refresh] itself.
	 * @param observeReachability replay the queue and refresh policy when connectivity returns.
	 * This one needs `android.permission.ACCESS_NETWORK_STATE`, which belongs to the
	 * host: without it the registration is refused and c15t carries on with the launch
	 * and foreground replays, so declaring it buys a faster retry rather than correctness.
	 * @return The installed core. A repeated call returns the core already installed.
	 * @throws com.c15t.core.InthProjectUrlException when `backendUrl` is not an Inth
	 * project URL.
	 * @throws IllegalStateException when `dryRun` is set in an app that is not debuggable.
	 */
	fun install(
		context: Context,
		config: NativeConfig,
		clock: Clock = Clock.SYSTEM,
		observeForeground: Boolean = true,
		observeReachability: Boolean = true,
		logger: (KernelError) -> Unit = defaultLogger,
	): ConsentCore {
		// A repeated call returns the running core and never uses this config, so it is not checked.
		if (C15t.current != null) return start(context, config, C15tTransport.NONE, clock, observeForeground, observeReachability, logger)
		val checked = checkedConfig(config, isDebuggable(context), enforceProjectUrl = true)
		return start(context, checked, HostedTransport(C15tHttpClient(), checked), clock, observeForeground, observeReachability, logger)
	}

	/**
	 * [install] with a transport the caller supplies, for c15t's own tests and device
	 * fixtures. It skips the project URL rule, so a Release fixture can reach a loopback
	 * backend. `dryRun` is still refused in an app that is not debuggable.
	 */
	@C15tInternalApi
	fun install(
		context: Context,
		config: NativeConfig,
		transport: C15tTransport,
		clock: Clock = Clock.SYSTEM,
		observeForeground: Boolean = true,
		observeReachability: Boolean = true,
		logger: (KernelError) -> Unit = defaultLogger,
	): ConsentCore {
		if (C15t.current != null) return start(context, config, transport, clock, observeForeground, observeReachability, logger)
		val checked = checkedConfig(config, isDebuggable(context), enforceProjectUrl = false)
		return start(context, checked, transport, clock, observeForeground, observeReachability, logger)
	}

	private val defaultLogger: (KernelError) -> Unit = { error -> Log.w(TAG, "${error.code}: ${error.message}") }

	/** Whether the host app is a debug build. The SDK ships as a release AAR, so its own build type says nothing. */
	internal fun isDebuggable(context: Context): Boolean =
		(context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

	/**
	 * The start-time rules, in one place so tests can drive them without a device.
	 *
	 * Refuses `dryRun` unless the app is debuggable. With [enforceProjectUrl], checks
	 * `backendUrl` and returns the config carrying its normal form, so the transport,
	 * the bundled-policy binding and the save `domain` all read the same string.
	 */
	internal fun checkedConfig(config: NativeConfig, debuggable: Boolean, enforceProjectUrl: Boolean): NativeConfig {
		check(!config.dryRun || debuggable) { DRY_RUN_IN_RELEASE }
		if (!enforceProjectUrl) return config
		return config.copy(backendUrl = InthProjectUrl.normalize(config.backendUrl, relaxed = config.dryRun))
	}

	internal const val DRY_RUN_IN_RELEASE =
		"dryRun is for development and CI and cannot run in a release build. " +
			"Remove dryRun (NativeConfig.dryRun or the com.c15t.DRY_RUN meta-data) from release builds."

	private fun start(
		context: Context,
		config: NativeConfig,
		transport: C15tTransport,
		clock: Clock,
		observeForeground: Boolean,
		observeReachability: Boolean,
		logger: (KernelError) -> Unit,
	): ConsentCore {
		val appContext = context.applicationContext
		val store = C15tStores.create(appContext)

		// One executor for both the core and the observer registered below, so the launch
		// replay and the foreground replay cannot deliver the same queued entry twice.
		val executor = worker

		val core = C15t.bootstrap(
			config = config,
			store = store,
			clock = clock,
			transport = transport,
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
	 * Without `com.c15t.BACKEND_URL` there is nothing to start. A declaration this build
	 * refuses (a retired key, a URL that is not an Inth project URL, or `com.c15t.DRY_RUN`
	 * in an app that is not debuggable) is logged as one error. Either way the core stays
	 * uninstalled and reads answer deny-all, which is the safe state for a misconfigured
	 * build rather than a crash at startup.
	 */
	fun bootstrap(context: Context) {
		when (val declared = checkedDeclaration(context)) {
			DeclaredConfig.None ->
				Log.i(TAG, "no $META_BACKEND_URL meta-data declared; c15t stays inactive until C15tAndroid.install")
			is DeclaredConfig.Refused -> Log.e(TAG, declared.reason)
			is DeclaredConfig.Valid -> start(
				context, declared.config, HostedTransport(C15tHttpClient(), declared.config),
				Clock.SYSTEM, observeForeground = true, observeReachability = true, logger = defaultLogger,
			)
		}
	}

	/**
	 * Read the declared configuration, or `null` when nothing usable is declared.
	 *
	 * The result has passed the same checks as [install]: `backendUrl` is in its normal
	 * form. A declaration this build refuses is logged as an error and reads as `null`.
	 */
	fun configFrom(context: Context): NativeConfig? = when (val declared = checkedDeclaration(context)) {
		DeclaredConfig.None -> null
		is DeclaredConfig.Refused -> {
			Log.e(TAG, declared.reason)
			null
		}
		is DeclaredConfig.Valid -> declared.config
	}

	/** What the manifest declares, after the start-time rules. */
	internal sealed interface DeclaredConfig {
		/** No backend URL, so there is nothing to start. */
		data object None : DeclaredConfig

		data class Valid(val config: NativeConfig) : DeclaredConfig

		/** Declared, and refused. [reason] is the line to log. */
		data class Refused(val reason: String) : DeclaredConfig
	}

	private fun checkedDeclaration(context: Context): DeclaredConfig {
		val bundle = try {
			context.packageManager
				.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
				.metaData
		} catch (error: PackageManager.NameNotFoundException) {
			null
		} ?: return DeclaredConfig.None

		return checkedDeclaration(
			read = { key -> C15tManifestValue.raw(bundle, key) },
			readAsset = { name ->
				try { context.assets.open(name).bufferedReader().use { it.readText() } }
				catch (error: java.io.IOException) { Log.w(TAG, "Cannot read bundled policy $name", error); null }
			},
			debuggable = isDebuggable(context),
		)
	}

	/** [declaredConfig], then the rules [install] applies. */
	internal fun checkedDeclaration(
		read: (String) -> Any?,
		readAsset: (String) -> String?,
		debuggable: Boolean,
	): DeclaredConfig {
		val declared = declaredConfig(read, readAsset)
		if (declared !is DeclaredConfig.Valid) return declared
		return try {
			DeclaredConfig.Valid(checkedConfig(declared.config, debuggable, enforceProjectUrl = true))
		} catch (error: IllegalStateException) {
			DeclaredConfig.Refused("${error.message} c15t stays inactive.")
		} catch (error: IllegalArgumentException) {
			DeclaredConfig.Refused("$META_BACKEND_URL refused: ${error.message} c15t stays inactive.")
		}
	}

	/** Retired meta-data keys, each with the line that names its replacement. */
	private val retiredKeys = mapOf(
		"com.c15t.MODE" to "com.c15t.MODE is no longer read. For development and CI set $META_DRY_RUN to true. " +
			"In production keep $META_BACKEND_URL; a bundled manifest ($META_BUNDLED_POLICY) or an in-code " +
			"policy ($META_POLICY_RULES) covers a launch without network.",
		"com.c15t.BACKEND_INIT_URL" to "com.c15t.BACKEND_INIT_URL is no longer read and has no replacement. " +
			"Policy is fetched from $META_BACKEND_URL.",
	)

	/**
	 * Build the configuration from raw meta-data values, so the mapping is testable
	 * without a device. `null` when nothing usable is declared or the declaration is refused.
	 *
	 * @param read returns the raw bundle entry for a key, typically `bundle.get(key)`.
	 * @param readAsset returns the text of a bundled asset, or `null` when it is unreadable.
	 */
	internal fun configFrom(read: (String) -> Any?, readAsset: (String) -> String?): NativeConfig? =
		(declaredConfig(read, readAsset) as? DeclaredConfig.Valid)?.config

	/** The manifest mapping, before the project URL and dryRun rules. */
	internal fun declaredConfig(read: (String) -> Any?, readAsset: (String) -> String?): DeclaredConfig {
		retiredKeys.entries.firstOrNull { read(it.key) != null }?.let { retired ->
			return DeclaredConfig.Refused("${retired.value} Remove the key. c15t stays inactive.")
		}
		// Every value goes through `C15tManifestValue`, which reads whichever type the
		// manifest parser chose. A hand-edited manifest and an Expo-generated one do not
		// arrive as the same Java type, and a reader that names one of them honours only
		// the app that happened to spell it that way.
		val backendUrl = C15tManifestValue.string(read(META_BACKEND_URL)) ?: return DeclaredConfig.None
		val declaredPolicy = C15tManifestValue.string(read(META_POLICY_RULES))?.let { name ->
			readAsset(name)?.let(::policyFrom) ?: Result.failure(IllegalArgumentException("$META_POLICY_RULES names $name, which cannot be read"))
		}
		val bundledPolicy = C15tManifestValue.string(read(META_BUNDLED_POLICY))
		if (declaredPolicy != null && bundledPolicy != null) {
			return DeclaredConfig.Refused(
				"$META_POLICY_RULES and $META_BUNDLED_POLICY do not mix. Declare one of them. c15t stays inactive.",
			)
		}
		// Absent stays absent. `false` is an answer and a missing key is not, and the
		// core treats them differently when it derives the signal.
		return DeclaredConfig.Valid(NativeConfig(
			backendUrl = backendUrl,
			dryRun = C15tManifestValue.boolean(read(META_DRY_RUN)) == true,
			bundledPolicy = bundledPolicy?.let(readAsset),
			policy = declaredPolicy?.getOrNull(),
			policyError = declaredPolicy?.exceptionOrNull()?.let { it.message ?: it.toString() },
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
			gpp = declaredGpp(read),
		))
	}

	/**
	 * Parse the in-code policy asset. A refused file is logged as an error and handed to
	 * the core as `NativeConfig.policyError`, which reports `policy-invalid` in the
	 * snapshot and keeps every optional category denied rather than crashing at launch.
	 */
	private fun policyFrom(json: String): Result<ConsentPolicy> = runCatching { ConsentPolicy.fromJson(json) }
		.onFailure { Log.e(TAG, "$META_POLICY_RULES refused: ${it.message}. c15t reports policy-invalid and denies optional categories.") }

	/**
	 * The GPP options the manifest declares: `null` unless `com.c15t.GPP` is `true`.
	 *
	 * An MSPA mode this build does not name reads as no mode, which reports the transaction as
	 * not covered rather than claiming a coverage nobody configured.
	 */
	internal fun declaredGpp(read: (String) -> Any?): GppOptions? {
		if (C15tManifestValue.boolean(read(META_GPP)) != true) return null
		return GppOptions(
			mspaMode = GppMspaMode.fromWireName(C15tManifestValue.string(read(META_GPP_MSPA_MODE))?.trim()),
			optOutCategories = declaredGppOptOutCategories(read(META_GPP_OPT_OUT_CATEGORIES)),
			tcf = C15tManifestValue.boolean(read(META_GPP_TCF)) ?: true,
		)
	}

	/**
	 * `com.c15t.GPP_OPT_OUT_CATEGORIES`, keeping "not set" apart from "set to empty".
	 *
	 * An absent key keeps the default, `marketing`. A present key is the app's list: `none`
	 * or a blank value is the empty list, meaning no category drives the sale, sharing and
	 * targeted advertising opt-outs, which is what `GppOptions(optOutCategories = emptyList())`
	 * and web's `optOutCategories: []` mean. Names neither core knows are dropped.
	 */
	internal fun declaredGppOptOutCategories(raw: Any?): List<ConsentCategory> {
		if (raw == null) return listOf(ConsentCategory.MARKETING)
		val text = raw.toString().trim()
		if (text.isEmpty() || text.equals(GPP_NO_OPT_OUT_CATEGORIES, ignoreCase = true)) return emptyList()
		return text.split(',').mapNotNull { ConsentCategory.fromWireName(it.trim()) }.distinct()
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

	/** `true` turns on the IAB GPP string and the `IABGPP_*` keys. */
	const val META_GPP = "com.c15t.GPP"

	/** `opt-out-option` or `service-provider`. Only for MSPA signatories. */
	const val META_GPP_MSPA_MODE = "com.c15t.GPP_MSPA_MODE"

	/**
	 * Comma-separated categories whose refusal reports a GPP opt-out. Absent means `marketing`;
	 * `none` means no category drives the opt-outs.
	 */
	const val META_GPP_OPT_OUT_CATEGORIES = "com.c15t.GPP_OPT_OUT_CATEGORIES"

	/** The [META_GPP_OPT_OUT_CATEGORIES] value for an empty list. */
	const val GPP_NO_OPT_OUT_CATEGORIES = "none"

	/** `false` leaves the TCF EU section out of the GPP string. */
	const val META_GPP_TCF = "com.c15t.GPP_TCF"

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
