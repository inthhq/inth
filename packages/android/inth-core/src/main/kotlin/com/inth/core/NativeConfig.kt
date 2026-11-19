package com.inth.core

import com.inth.core.model.ConsentCategory
import com.inth.core.model.KernelOverrides
import com.inth.core.transport.InthProtocol

/**
 * Everything the core needs that is not an injected capability.
 *
 * Pure data: nothing here runs at construction, and no field changes consent
 * semantics on its own. The backend identifies the project by URL, the same way
 * the hosted transport in `@c15t/core` assumes, so there is no key in this type.
 *
 * @property backendUrl The project URL from the Inth dashboard, such as
 * `https://your-project.inth.app`. `InthAndroid.install` checks it with [InthProjectUrl].
 * @property dryRun For development and CI. Prompts, storage, gating and consent signals
 * work as normal, and consent records and identity calls are dropped instead of sent.
 * `InthAndroid.install` refuses it in an app that is not debuggable.
 * @property domain Value sent as the `domain` field of `POST /subjects`. Defaults
 * to the host of [backendUrl].
 * @property consentCategories Categories the host offers. `null` or empty declares
 * none: a strict policy offers its full scope and a permissive one offers
 * `necessary` alone, with an acknowledgement prompt.
 * @property vendors Vendor ids this deployment may disclose, or `null` for no
 * declaration. The Android twin of `iab.vendors` on web.
 *
 * Web puts that option to three uses: filtering the GVL request, narrowing the list the
 * module holds through `narrowGVLToVendors`, and clearing a summary that had counted the
 * wider list. The first one reaches this core as the `x-inth-vendors` request header, the
 * second is what [com.inth.core.ConsentCore] does with this field on every path a list
 * arrives by, and the third has no native equivalent yet because this build holds one
 * list and reports it whole.
 *
 * `null` and an empty list are the same answer: no scope declared, so a served list is
 * kept exactly as it arrived. Both web narrows read an empty list that way --
 * `narrowGVLToVendors` in `packages/sdk/iab/src/tcf/fetch-gvl.ts` hands the document back, and
 * `gvlRequestUrl` in `packages/backend/src/http/gvl.ts` does not put the scope on the
 * request line at all -- and [com.inth.core.tc.narrowToVendorIds] says so on its own
 * terms. A core that read `emptyList()` as "show nobody" would leave a publisher who never
 * scoped anything with an empty drawer under a consent the subject can still give, so a
 * host that means no vendors has to say so somewhere other than here.
 *
 * Ids the served document does not carry buy nothing, so an out-of-range or publisher-custom id
 * costs nothing, and the framework half of the document -- purposes, features, stacks, and both
 * version numbers -- is never moved by a scope.
 *
 * @property iab Approved CMP identity and publisher settings. Required to commit under an IAB
 *   policy.
 * @property overrides Developer overrides applied before the first init, so a staged build can pin
 *   country, region, language, or GPC.
 * @property detectedGpc The GPC signal the device reports, or `null` when it has none. There is no
 *   user-agent GPC flag to read natively, so this has to come from wherever the signal actually
 *   lives: a WebView's `isGlobalPrivacyControlEnabled`, an equivalent Android check, or the React
 *   Native layer. `null` means "no signal", which is not the same answer as `false`. An app
 *   override on [overrides] wins over this.
 * @property platform The host that built this core, sent as `x-inth-platform: <platform>-><sdkVersion>`.
 *   [InthProtocol.PLATFORM_ANDROID] for a Kotlin or Java app, and the React Native binding sets
 *   [InthProtocol.PLATFORM_REACT_NATIVE]. `null` sends no platform header.
 * @property extraHeaders Extra request headers, for a deployment that needs its own auth or tenant
 *   header.
 * @property maxPendingSaves Offline write queue depth; the contract maximum is 20.
 * @property gpp Turns on the IAB GPP string: [com.inth.core.model.ConsentSnapshot.gppString] and the `IABGPP_*`
 *   storage keys. `null`, the default, writes no GPP signal. See [com.inth.core.gpp.GppOptions].
 */
data class NativeConfig(
	val backendUrl: String,
	val domain: String? = null,
	val sdkVersion: String = InthProtocol.DEFAULT_SDK_VERSION,
	val platform: String? = InthProtocol.PLATFORM_ANDROID,
	val consentCategories: List<ConsentCategory>? = null,
	val vendors: List<Int>? = null,
	val iab: com.inth.core.iab.IabConfiguration? = null,
	val iabListMaxAgeMs: Long = 604_800_000,
	val overrides: KernelOverrides = KernelOverrides(),
	val detectedGpc: Boolean? = null,
	val extraHeaders: Map<String, String> = emptyMap(),
	val maxPendingSaves: Int = 20,
	/**
	 * Raw manifest bundled at build time for [backendUrl], loaded by the Android adapter
	 * before JavaScript. Used only while no live or cached `/init` response is available.
	 */
	val bundledPolicy: String? = null,
	/**
	 * The policy in source control. The device resolves it locally and never calls
	 * `/init`; records still go to [backendUrl]. Does not mix with [bundledPolicy].
	 */
	val policy: ConsentPolicy? = null,
	/**
	 * Why the app's declared in-code policy was refused, when an adapter read one and
	 * could not use it. The core then reports `policy-invalid` in the snapshot and on the
	 * error stream instead of starting as if no policy had been declared.
	 */
	val policyError: String? = null,
	val gpp: com.inth.core.gpp.GppOptions? = null,
	val dryRun: Boolean = false,
) {
	init {
		require(iabListMaxAgeMs > 0)
		require(backendUrl.isNotBlank()) { "NativeConfig.backendUrl must not be blank" }
		require(policy == null && policyError == null || bundledPolicy == null) {
			"NativeConfig.policy does not mix with bundledPolicy"
		}
	}
}
