/**
 * Where each vendor SDK sends its traffic when a test owns the network.
 *
 * `scripts/vendor_capture.py` serves `/vendor/<name>/…` and records every request,
 * so pointing each SDK's host option here lets a test count what each SDK sent.
 * Pure on purpose: the Expo fixture and the unit test import it without React Native.
 */

/** Host options for the four vendors that can be redirected. Firebase cannot. */
export interface VendorCaptureEndpoints {
	/** Amplitude `serverUrl`, the full HTTP API path. */
	readonly amplitudeServerUrl: string;
	/** Mixpanel `serverURL`. The SDK appends `/track/`, `/engage/` and so on. */
	readonly mixpanelServerURL: string;
	/** PostHog `host`. The SDK appends `/batch/` and `/flags/`. */
	readonly posthogHost: string;
	/** Sentry DSN. Sentry derives `/vendor/sentry/api/1/envelope/` from it. */
	readonly sentryDsn: string;
}

/** Split an `http(s)://host[:port]` origin. */
const parseOrigin = (
	baseUrl: string
): { readonly authority: string; readonly scheme: string } => {
	// Hermes has only a partial URL implementation, so this is parsed by hand.
	const match = /^(?<scheme>https?):\/\/(?<authority>[^/]+)\/*$/u.exec(baseUrl);
	const scheme = match?.groups?.scheme;
	const authority = match?.groups?.authority;

	if (scheme === undefined || authority === undefined) {
		throw new TypeError(`Expected an http(s) origin, got ${baseUrl}`);
	}

	return { authority, scheme };
};

/**
 * Build every vendor host option from one loopback base URL.
 *
 * Mixpanel's Android SDK treats a host that resolves to loopback as blocked by an
 * ad blocker and sends nothing, so `adb reverse` to `localhost` cannot reach it.
 * On the Android emulator, pass `http://10.0.2.2:<port>` as `mixpanelBaseUrl`.
 *
 * @param baseUrl - Capture server origin, such as `http://localhost:3000`.
 * @param mixpanelBaseUrl - Origin for Mixpanel only. Defaults to `baseUrl`.
 * @returns The SDK options that send all vendor traffic to that server.
 * @throws {TypeError} When an origin is not `http://` or `https://`.
 */
export const vendorCaptureEndpoints = (
	baseUrl: string,
	mixpanelBaseUrl: string = baseUrl
): VendorCaptureEndpoints => {
	const { authority, scheme } = parseOrigin(baseUrl);
	const origin = `${scheme}://${authority}`;
	const mixpanel = parseOrigin(mixpanelBaseUrl);

	return {
		amplitudeServerUrl: `${origin}/vendor/amplitude/2/httpapi`,
		mixpanelServerURL: `${mixpanel.scheme}://${mixpanel.authority}/vendor/mixpanel`,
		posthogHost: `${origin}/vendor/posthog`,
		sentryDsn: `${scheme}://public@${authority}/vendor/sentry/1`,
	};
};
