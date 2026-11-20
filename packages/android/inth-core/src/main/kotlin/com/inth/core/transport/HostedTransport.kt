package com.inth.core.transport

import com.inth.core.InthInternalApi
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelUser
import com.inth.core.model.QueuedSave
import com.inth.core.spi.Clock
import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Talks to the Inth backend's `/v1` consent routes on the project URL.
 *
 * `GET /v1/consent/init`, `POST /v1/consent/records` and `POST /v1/subjects/{id}/link`,
 * and nothing else. It holds no state: it turns a [com.inth.core.spi.HttpClient] into the
 * three commands the core delegates, and leaves every decision to [InitMapper] and the
 * kernel.
 *
 * Internal: `InthAndroid.install` builds this one. Tests and first-party fixtures build
 * their own to reach a loopback or test backend.
 */
@InthInternalApi
class HostedTransport(
	private val http: HttpClient,
	private val config: NativeConfig,
	@Suppress("unused") private val clock: Clock = Clock.SYSTEM,
	private val json: Json = Json { ignoreUnknownKeys = true },
) : InthTransport {
	private val base: String = trimTrailingSlash(config.backendUrl)

	override fun init(context: InitContext): TransportOutcome {
		val headers = linkedMapOf(
			"accept" to "application/json",
		)
		headers.putAll(InthProtocol.protocolHeaders(config.sdkVersion, config.platform))
		// The override travels as the application header and wins on the backend;
		// the plain `sec-gpc` carries the merged signal the core honors.
		context.overrides.gpc?.let { headers["x-inth-gpc"] = if (it) "1" else "0" }
		if (context.gpc && context.overrides.gpc == null) {
			headers["sec-gpc"] = "1"
		}
		context.overrides.country?.let { headers["x-inth-country"] = it }
		context.overrides.region?.let { headers["x-inth-region"] = it }
		context.overrides.language?.let { headers["accept-language"] = it }
		// The declared vendor scope, on the request that asks for the list it scopes. The
		// kernel prunes whatever comes back regardless -- this header saves bytes, it is
		// not the guarantee -- which is why a scope too wide to name here is simply not
		// named and still produces a narrow device.
		InthProtocol.vendorScopeHeaderValue(context.vendors)?.let { scope ->
			headers[InthProtocol.VENDOR_SCOPE_HEADER] = scope
		}

		return send(HttpRequest(method = HttpRequest.GET, url = initUrl(context), headers = headers))
	}

	/**
	 * The init URL with the device's inputs in the query string: `country`, `region`,
	 * `language` and `gpc`, each only when the device has a value.
	 */
	private fun initUrl(context: InitContext): String {
		val gpc = context.overrides.gpc ?: context.gpc.takeIf { it }
		val query = listOfNotNull(
			context.overrides.country?.let { "country" to it },
			context.overrides.region?.let { "region" to it },
			context.overrides.language?.let { "language" to it },
			gpc?.let { "gpc" to if (it) "1" else "0" },
		)
		val url = base + InthProtocol.INIT_PATH
		if (query.isEmpty()) return url
		return url + "?" + query.joinToString("&") { (name, value) -> "$name=${uriEncode(value)}" }
	}

	override fun save(entry: QueuedSave): SaveOutcome {
		val request = HttpRequest(
			method = HttpRequest.POST,
			url = base + InthProtocol.RECORDS_PATH,
			headers = jsonHeaders(),
			body = entry.body
				?: json.encodeToString(JsonElement.serializer(), SaveBodyBuilder.build(entry.payload, config.resolvedProperty)),
		)
		return when (val outcome = send(request)) {
			is TransportOutcome.Success -> SaveOutcome.Delivered(subjectIdOf(outcome))
			is TransportOutcome.HttpFailure -> SaveOutcome.Rejected(outcome)
			is TransportOutcome.NetworkFailure -> SaveOutcome.Unavailable(outcome.message)
		}
	}

	override fun link(
		subject: ConsentSubject,
		user: KernelUser,
		identityToken: String,
	): LinkOutcome {
		val request = HttpRequest(
			method = HttpRequest.POST,
			url = base + InthProtocol.linkPath(uriEncode(subject.id)),
			headers = jsonHeaders(),
			body = json.encodeToString(
				JsonElement.serializer(),
				buildJsonObject {
					put("externalId", user.externalId)
					user.identityProvider?.let { put("identityProvider", it) }
					put("identityToken", identityToken)
				},
			),
		)
		return when (val outcome = send(request)) {
			is TransportOutcome.Success -> LinkOutcome.Linked(subjectIdOf(outcome))
			is TransportOutcome.HttpFailure -> LinkOutcome.Rejected(outcome)
			is TransportOutcome.NetworkFailure -> LinkOutcome.Unavailable(outcome.message)
		}
	}

	private fun jsonHeaders(): Map<String, String> = buildMap {
		put("accept", "application/json")
		put("content-type", "application/json")
		putAll(InthProtocol.protocolHeaders(config.sdkVersion, config.platform))
	}

	/**
	 * Never throws. A non-2xx status is an [TransportOutcome.HttpFailure] so the
	 * kernel can tell "the backend answered no" apart from "nothing answered".
	 */
	private fun send(request: HttpRequest): TransportOutcome = try {
		val response = http.send(request)
		if (!response.ok) {
			httpFailure(response)
		} else {
			TransportOutcome.Success(parseBody(response), response.headers.lowerCased())
		}
	} catch (error: Exception) {
		TransportOutcome.NetworkFailure("Inth transport: ${error.message ?: error.javaClass.simpleName}")
	}

	/**
	 * Read the `/v1` error body `{ "error": { "code", "message" }, "requestId" }`. The
	 * request id falls back to the `x-request-id` header, the message to the raw body text.
	 */
	private fun httpFailure(response: HttpResponse): TransportOutcome.HttpFailure {
		val raw = response.body?.trim().orEmpty()
		val root = parseBody(response) as? JsonObject
		val error = root?.get("error") as? JsonObject
		return TransportOutcome.HttpFailure(
			status = response.status,
			code = error.string("code"),
			requestId = root.string("requestId") ?: response.header(InthProtocol.REQUEST_ID_HEADER)?.takeIf { it.isNotBlank() },
			message = error.string("message") ?: raw.ifEmpty { null },
		)
	}

	private fun parseBody(response: HttpResponse): JsonElement? {
		val raw = response.body?.takeIf { it.isNotBlank() } ?: return null
		return try {
			json.parseToJsonElement(raw)
		} catch (_: Exception) {
			// A 2xx with an unreadable document is an invalid payload, which the
			// strict reader reports; keeping it null reaches the same conclusion.
			null
		}
	}

	private companion object {
		fun trimTrailingSlash(value: String): String =
			if (value.length > 1 && value.endsWith("/")) value.dropLast(1) else value

		fun uriEncode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

		/** The `subjectId` a `200` names. The core decides whether to adopt it. */
		fun subjectIdOf(outcome: TransportOutcome.Success): String? = (outcome.body as? JsonObject).string("subjectId")

		fun JsonObject?.string(key: String): String? =
			(this?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.takeIf { it.isNotEmpty() }

		fun Map<String, String>.lowerCased(): Map<String, String> =
			this.entries.associateTo(LinkedHashMap()) { (key, value) -> key.lowercase() to value }
	}
}
