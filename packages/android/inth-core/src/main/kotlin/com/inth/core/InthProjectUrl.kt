package com.inth.core

/**
 * A `backendUrl` that is not an Inth project URL.
 *
 * @property reason The code from `packages/native-protocol/project-url/cases.json`: `empty`,
 * `malformed`, `scheme`, `credentials`, `host`, `port`, `path` or `query`.
 */
class InthProjectUrlException(
	val reason: String,
	message: String,
) : IllegalArgumentException(message)

/**
 * The project URL rule for the mobile SDKs, which work only with the Inth hosted service.
 *
 * `packages/native-protocol/project-url/cases.json` is the shared fixture. Swift and TypeScript
 * apply the same steps in the same order.
 */
object InthProjectUrl {
	/** A project host is one or more labels in front of one of these. */
	val ALLOWED_HOST_SUFFIXES: List<String> = listOf("inth.app")

	private val projectHost = Regex(
		"^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+(" +
			ALLOWED_HOST_SUFFIXES.joinToString("|") { Regex.escape(it) } + ")$",
	)

	/** A host name or a bracketed IPv6 literal, the shapes the relaxed rule takes. */
	private val plausibleHost = Regex("^(\\[[0-9a-f:.]+\\]|[a-z0-9.-]+)$")

	private val loopbackHosts = setOf("localhost", "127.0.0.1", "[::1]")

	/**
	 * Check [input] and return its normal form.
	 *
	 * The strict rule takes `https://<project>.<suffix>` with no port, path, query or
	 * credentials, and returns `https://<lowercased host>`.
	 *
	 * @param relaxed The rule for `dryRun` in a debuggable app: any `https` URL, or `http`
	 * on `localhost`, `127.0.0.1` or `[::1]`, with a port and a path allowed.
	 * @throws InthProjectUrlException when the value is refused. `reason` carries the code.
	 */
	fun normalize(input: String, relaxed: Boolean = false): String {
		val value = input.trim()
		if (value.isEmpty()) refuse(input, "empty", "the value is empty")
		if (value.any { it.isWhitespace() }) refuse(input, "malformed", "it contains whitespace")

		val url = if (value.contains("://")) value else "https://$value"
		val scheme = url.substringBefore("://").lowercase()
		if (scheme != "https" && !(relaxed && scheme == "http")) {
			refuse(input, "scheme", "the scheme must be https")
		}

		val rest = url.substringAfter("://")
		val authorityEnd = rest.indexOfFirst { it == '/' || it == '?' || it == '#' }.let { if (it < 0) rest.length else it }
		val authority = rest.substring(0, authorityEnd)
		val tail = rest.substring(authorityEnd)
		val hostPort = authority.substringAfterLast('@')
		val (rawHost, port) = splitPort(hostPort) ?: refuse(input, "malformed", "it does not parse as a URL")
		val host = rawHost.lowercase()
		if (host.isEmpty()) refuse(input, "malformed", "it has no host")

		if (relaxed && !plausibleHost.matches(host)) refuse(input, "malformed", "it does not parse as a URL")
		if (scheme == "http" && host !in loopbackHosts) {
			refuse(input, "scheme", "http is allowed only on localhost, 127.0.0.1 or [::1]")
		}
		if (authority.contains('@')) {
			refuse(input, "credentials", "it must not carry a username or password")
		}

		val pathEnd = tail.indexOfFirst { it == '?' || it == '#' }.let { if (it < 0) tail.length else it }
		val path = tail.substring(0, pathEnd).trimEnd('/')
		val hasQuery = pathEnd < tail.length

		if (!relaxed) {
			if (!projectHost.matches(host)) {
				refuse(
					input,
					"host",
					"the host must be a project host under " + ALLOWED_HOST_SUFFIXES.joinToString(" or "),
				)
			}
			if (port != null) refuse(input, "port", "it must not name a port")
			if (path.isNotEmpty()) refuse(input, "path", "it must not have a path")
		}
		if (hasQuery) refuse(input, "query", "it must not have a query or a fragment")

		val normalized = buildString {
			append(scheme).append("://").append(host)
			if (port != null) append(':').append(port)
			append(path)
		}
		// The relaxed rule takes hosts and paths the checks above do not vet.
		if (runCatching { java.net.URI(normalized).host }.getOrNull() == null) {
			refuse(input, "malformed", "it does not parse as a URL")
		}
		return normalized
	}

	/** Host and port of `host`, `host:port` or `[v6]:port`, or `null` when neither shape fits. */
	private fun splitPort(hostPort: String): Pair<String, String?>? {
		val host: String
		val after: String
		if (hostPort.startsWith("[")) {
			val close = hostPort.indexOf(']')
			if (close < 0) return null
			host = hostPort.substring(0, close + 1)
			after = hostPort.substring(close + 1)
		} else {
			val colon = hostPort.indexOf(':')
			host = if (colon < 0) hostPort else hostPort.substring(0, colon)
			after = if (colon < 0) "" else hostPort.substring(colon)
		}
		if (after.isEmpty()) return host to null
		val port = after.removePrefix(":")
		if (!after.startsWith(":") || port.isEmpty() || !port.all { it in '0'..'9' }) return null
		if (port.trimStart('0').length > 5 || (port.trimStart('0').toIntOrNull() ?: 0) > 65_535) return null
		return host to port
	}

	private fun refuse(input: String, reason: String, detail: String): Nothing = throw InthProjectUrlException(
		reason,
		"backendUrl must be the project URL from your Inth dashboard, such as " +
			"https://your-project.inth.app. Got \"$input\": $detail.",
	)
}
