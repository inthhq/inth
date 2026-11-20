package com.inth.core.transport

/**
 * Routes and headers of the Inth backend's `/v1` consent API. See "Transports" in
 * `packages/native-protocol/CONTRACT.md`.
 */
object InthProtocol {
	/** `GET`: policy, location, translations and the vendor list. */
	const val INIT_PATH = "/v1/consent/init"

	/** `POST`: one consent save, the bytes the pending queue holds. */
	const val RECORDS_PATH = "/v1/consent/records"

	/** `POST /v1/subjects/{id}/link`, with [encodedSubjectId] already percent-encoded. */
	fun linkPath(encodedSubjectId: String): String = "/v1/subjects/$encodedSubjectId/link"

	/** The response header a request id falls back to when the error body names none. */
	const val REQUEST_ID_HEADER = "x-request-id"

	/**
	 * The `x-inth-vendors` header name: the publisher's declared vendor scope.
	 *
	 * A scope declaration, not a filter this client relies on. It is the mobile spelling of the
	 * `vendorIds` parameter that `gvlRequestUrl` in `packages/backend/src/http/gvl.ts` puts on the
	 * upstream GVL request, which is why it travels as a header: `/init` is a GET this core builds
	 * from the project URL, and a client that invented query parameters on a route it does not own
	 * would break every deployment behind a proxy. A header rather than a body field for the same
	 * reason as the country and region overrides beside it -- the producer has to read it before it
	 * decides what to build, and `/init` has no body to put it in.
	 *
	 * A hint about bytes, never the answer about disclosure. A producer that honours it sends a list
	 * that needs no pruning; one that ignores it sends the wide one, and
	 * [com.inth.core.NativeConfig.vendors] prunes it on the way into state. That is why an over-cap
	 * declaration sends no header and still gets a narrow device.
	 *
	 * The name is shared wire vocabulary: a producer reads the same header from a device, and the
	 * server half of it is specified by the same name and the same cap recorded on
	 * [MAX_VENDOR_SCOPE_HEADER_IDS].
	 */
	const val VENDOR_SCOPE_HEADER = "x-inth-vendors"

	/**
	 * How many declared ids this build will still put on one request line.
	 *
	 * The same ceiling as `MAX_GVL_QUERY_VENDOR_IDS` in `packages/sdk/iab/src/tcf/fetch-gvl.ts` and in
	 * `packages/backend/src/http/gvl.ts`, for the same reason: past it the scope stops fitting
	 * comfortably in a request line, the producer is expected to fetch the list whole, and every
	 * consumer narrows locally. Both web functions keep that local prune above the cap, so the web
	 * answer for a 609-id publisher is "ask for everything, show your own partners", and this must
	 * not be the build that silently truncates a header into a different scope.
	 */
	const val MAX_VENDOR_SCOPE_HEADER_IDS = 500

	/**
	 * The `x-inth-platform` header name: which host built the request. Telemetry only.
	 *
	 * The value is `<platform>-><sdkVersion>`, the same shape the Apple installer sends as
	 * `apple-><version>`.
	 */
	const val PLATFORM_HEADER = "x-inth-platform"

	/** Platform tag for a Kotlin or Java app that installs the core itself. */
	const val PLATFORM_ANDROID = "android"

	/** Platform tag for the Android side of `@inth/react-native`. */
	const val PLATFORM_REACT_NATIVE = "rn"

	/** Default SDK version, kept in step with the `@inth/sdk-core` alpha line. */
	const val DEFAULT_SDK_VERSION = "3.0.0-alpha.1"

	/**
	 * The telemetry header every Inth-bound request carries: [PLATFORM_HEADER] for
	 * [platform], or no header when [platform] is `null`. There is no version header.
	 */
	fun protocolHeaders(
		sdkVersion: String = DEFAULT_SDK_VERSION,
		platform: String? = null,
	): Map<String, String> = buildMap {
		platform?.takeIf { it.isNotBlank() }?.let { put(PLATFORM_HEADER, "$it->$sdkVersion") }
	}

	/**
	 * The `x-inth-vendors` value for a declared scope, or `null` for no header.
	 *
	 * Deduplicated and ascending, so two hosts who declared the same partners in a
	 * different order, or twice in the same list, ask the same question of the backend.
	 * That stability is what makes the value cacheable and comparable on the producer side,
	 * which is exactly what the `vendorIds` parameter is keyed on upstream --
	 * `fetch-gvl.ts` sorts before it builds its cache key.
	 *
	 * Absent for the cases where a scope would be a lie or a burden: `null` and an empty
	 * list both mean no declaration, and above [MAX_VENDOR_SCOPE_HEADER_IDS] the scope
	 * cannot travel on the request line. In all of those the served list is whatever the
	 * producer chooses, and the local prune is what answers for it.
	 *
	 * @param vendorIds the declared ids, in whatever order the host wrote them.
	 * @return the ids as `1,2,3`, or `null` when no header should be sent.
	 */
	fun vendorScopeHeaderValue(vendorIds: List<Int>?): String? {
		if (vendorIds.isNullOrEmpty()) {
			return null
		}
		if (vendorIds.size > MAX_VENDOR_SCOPE_HEADER_IDS) {
			return null
		}
		val ids = vendorIds.distinct().sorted()
		if (ids.isEmpty()) {
			return null
		}
		return ids.joinToString(",")
	}

}
