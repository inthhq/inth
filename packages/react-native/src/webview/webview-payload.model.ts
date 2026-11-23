/**
 * The WebView consent payload the native cores build, and the origin rules
 * every platform shares. See "WebView consent" in `packages/native-protocol/CONTRACT.md`.
 */

/** What `getWebViewConsent()` returns once parsed. */
export interface WebViewConsentPayload {
	/**
	 * The state a page reads: version, readiness, revision, model,
	 * permissions, TC string and GPP string. Never the subject id.
	 */
	readonly state: Readonly<Record<string, unknown>>;
	/** 128 random bits, hex. Only scripts that carry it can change a page's state. */
	readonly token: string;
	/**
	 * 128 random bits, hex. A page's preferences request must carry it. Only the
	 * top frame's document-start closure holds it, so a frame cannot send one.
	 */
	readonly key: string;
}

/**
 * The message a page prepared with `key` posts to ask the app for its
 * preferences.
 *
 * @param key - The request key the document-start script was given.
 * @returns The exact message text.
 */
export const preferencesRequest = function preferencesRequest(
	key: string
): string {
	return `{"type":"inth:open-preferences","key":"${key}"}`;
};

const TOKEN = /^[0-9a-f]{32}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parse the bridge reply. Anything malformed reads as `null`, so nothing is
 * injected and the page falls back to its own banner.
 *
 * @param raw - The JSON text `getWebViewConsent()` returned.
 * @returns The payload, or `null`.
 */
export const parseWebViewConsent = function parseWebViewConsent(
	raw: string
): WebViewConsentPayload | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (
		!isRecord(parsed) ||
		!isRecord(parsed.state) ||
		parsed.state.version !== 1 ||
		typeof parsed.token !== 'string' ||
		!TOKEN.test(parsed.token) ||
		typeof parsed.key !== 'string' ||
		!TOKEN.test(parsed.key)
	) {
		return null;
	}
	return { key: parsed.key, state: parsed.state, token: parsed.token };
};

const ORIGIN =
	/^(?<scheme>https?):\/\/(?<host>[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(?::(?<port>[0-9]{1,5}))?\/?$/iu;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The canonical form of `input`, or `null` when it is not an origin the
 * helpers accept: `https`, or `http` on a loopback host, with no path,
 * query, fragment, credentials or wildcard.
 *
 * @param input - An origin as the app wrote it.
 * @returns The normalized origin, or `null`.
 */
export const normalizeWebViewOrigin = function normalizeWebViewOrigin(
	input: string
): string | null {
	const groups = ORIGIN.exec(input)?.groups;
	if (!groups) {
		return null;
	}
	const scheme = (groups.scheme ?? '').toLowerCase();
	const host = (groups.host ?? '').toLowerCase();
	const portText = groups.port;
	if (scheme === 'http' && !LOOPBACK.has(host)) {
		return null;
	}
	let port = '';
	if (portText !== undefined) {
		const number = Number(portText);
		if (number < 1 || number > 65_535) {
			return null;
		}
		const isDefault =
			(scheme === 'https' && number === 443) ||
			(scheme === 'http' && number === 80);
		if (!isDefault) {
			port = `:${number}`;
		}
	}
	return `${scheme}://${host}${port}`;
};

/**
 * Every entry normalized, without duplicates.
 *
 * @param inputs - Origins as the app wrote them.
 * @returns The normalized list.
 * @throws {Error} When the list is empty or an entry is not accepted.
 */
export const normalizeWebViewOrigins = function normalizeWebViewOrigins(
	inputs: readonly string[]
): string[] {
	if (inputs.length === 0) {
		throw new Error(
			'useWebViewConsent: list at least one origin the WebView may receive consent on.'
		);
	}
	const origins: string[] = [];
	for (const input of inputs) {
		const origin = normalizeWebViewOrigin(input);
		if (origin === null) {
			throw new Error(
				`useWebViewConsent: "${input}" is not an allowed WebView origin. Use https://host[:port], or http:// on localhost.`
			);
		}
		if (!origins.includes(origin)) {
			origins.push(origin);
		}
	}
	return origins;
};

/**
 * The origin of a page URL, normalized, or `null`.
 *
 * @param url - The URL a WebView reports for a message.
 * @returns The origin, or `null` when the URL has none the helpers accept.
 */
export const originOfUrl = function originOfUrl(
	url: string | undefined
): string | null {
	const origin = url
		? /^(?<origin>[a-z][a-z0-9+.-]*:\/\/[^/?#]*)/iu.exec(url)?.groups?.origin
		: undefined;
	return origin ? normalizeWebViewOrigin(origin) : null;
};
