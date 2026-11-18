/**
 * The five vendor SDKs the Inth integrations control, started for real.
 *
 * Each SDK starts in its refused state, as the integration docs require, and is
 * handed to the same `connectApp*` functions the documentation shows. Traffic goes
 * to the capture server through {@link vendorCaptureEndpoints}. Firebase cannot be
 * redirected; its debug log is the evidence instead.
 *
 * Nothing here reads this app's configuration, so the Expo fixture can import it
 * unchanged. Call {@link startRealVendorSdks} once per JavaScript runtime.
 */

import { createInstance as createAmplitude } from '@amplitude/analytics-react-native';
import type { ConsentIntegration } from '@inth/react-native/integrations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
	getAnalytics,
	logEvent,
	setAnalyticsCollectionEnabled,
	setConsent,
} from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';
import { Mixpanel } from 'mixpanel-react-native';
import PostHog from 'posthog-react-native';

import { connectAppAmplitude } from '../documentation/amplitude-integration';
import { connectAppFirebaseAnalytics } from '../documentation/firebase-integration';
import { connectAppMixpanel } from '../documentation/mixpanel-integration';
import { connectAppPostHog } from '../documentation/posthog-integration';
import { connectAppSentryReplay } from '../documentation/sentry-replay-integration';
import { vendorCaptureEndpoints } from './capture-endpoints';

/** Every vendor this module starts, in report order. */
export const VENDOR_NAMES = [
	'posthog',
	'mixpanel',
	'amplitude',
	'sentry',
	'firebase',
] as const;

export type VendorName = (typeof VENDOR_NAMES)[number];

/** Placeholder project keys. The capture server accepts anything. */
const FAKE_KEYS = {
	amplitude: 'inth_e2e_amplitude_key',
	mixpanel: 'inth_e2e_mixpanel_token',
	posthog: 'phc_inth_e2e',
} as const;

/** Upper bound for one vendor's flush, so a stuck SDK fails the probe. */
const FLUSH_TIMEOUT_MS = 10000;

/** What one probe did. */
export interface VendorProbeResult {
	/** Event name sent through every SDK. Unique per probe. */
	readonly name: string;
	/** Vendor calls that threw or timed out, by vendor. */
	readonly errors: Partial<Record<VendorName, string>>;
	readonly startedAt: number;
	readonly finishedAt: number;
}

/** The running SDKs and their Inth connections. */
export interface RealVendorSdks {
	/** One app-lifetime Inth connection per vendor. */
	readonly integrations: Readonly<Record<VendorName, ConsentIntegration>>;
	/**
	 * Settle every integration with `sync()`, then send one event named `name`
	 * through every SDK and flush each one.
	 *
	 * The calls are not gated on consent: the point is to see whether the
	 * vendor's own opt-out, set by Inth, drops them. Sentry gets a breadcrumb and
	 * a client flush. Replay segments upload on Sentry's own schedule, and
	 * `Replay.flush()` is avoided because it starts a replay when none is running.
	 */
	readonly probe: (name: string) => Promise<VendorProbeResult>;
}

/** Options for {@link startRealVendorSdks}. */
export interface RealVendorSdkOptions {
	/** Capture server origin, such as `http://localhost:3000`. */
	readonly baseUrl: string;
	/** Capture server origin for Mixpanel. See {@link vendorCaptureEndpoints}. */
	readonly mixpanelBaseUrl?: string;
	/** Turn on vendor SDK logging where it is off by default (Mixpanel). */
	readonly logging?: boolean;
	/** Receives any vendor failure, during start or later consent changes. */
	readonly onError: (vendor: VendorName, error: unknown) => void;
}

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const withTimeout = async <ResultType>(
	work: Promise<ResultType>,
	label: string
): Promise<ResultType> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`${label} did not settle in ${FLUSH_TIMEOUT_MS} ms`));
		}, FLUSH_TIMEOUT_MS);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Start every SDK refused, connect each one to Inth, and wait for the first apply.
 *
 * @param options - Capture server origin and an error reporter.
 * @returns The connected SDKs, once every integration's `ready` has settled.
 * @throws {Error} When an SDK cannot start, such as Sentry without its replay.
 */
export const startRealVendorSdks = async ({
	baseUrl,
	logging = false,
	mixpanelBaseUrl,
	onError,
}: RealVendorSdkOptions): Promise<RealVendorSdks> => {
	const endpoints = vendorCaptureEndpoints(baseUrl, mixpanelBaseUrl);
	const reporter = (vendor: VendorName) => (error: unknown) => {
		onError(vendor, error);
	};

	// Sentry: replay is started only by Inth. Both sample rates stay at zero so
	// Sentry never records on its own, and error reporting is left as configured.
	Sentry.init({
		dsn: endpoints.sentryDsn,
		enableAppHangTracking: false,
		enableAutoSessionTracking: false,
		enableWatchdogTerminationTracking: false,
		integrations: [Sentry.mobileReplayIntegration()],
		replaysOnErrorSampleRate: 0,
		replaysSessionSampleRate: 0,
	});
	const replay = Sentry.getReplay();
	if (replay === undefined) {
		throw new Error('Sentry started without its mobile replay integration');
	}

	// PostHog: nothing is captured until opt-in. Lifecycle events stay off so the
	// probe is the only event the app sends. Explicit storage keeps PostHog off an
	// Expo file system module that a bare app links without its native half.
	const posthog = new PostHog(FAKE_KEYS.posthog, {
		captureAppLifecycleEvents: false,
		customStorage: AsyncStorage,
		defaultOptIn: false,
		host: endpoints.posthogHost,
	});

	// Mixpanel: the native SDK, opted out by default, sending to the capture server.
	const mixpanel = new Mixpanel(FAKE_KEYS.mixpanel, false);
	await mixpanel.init(true, {}, endpoints.mixpanelServerURL);
	mixpanel.setLoggingEnabled(logging);

	// Amplitude: opted out at init, with automatic session and lifecycle events off.
	const amplitude = createAmplitude();
	await amplitude.init(FAKE_KEYS.amplitude, undefined, {
		autocapture: false,
		optOut: true,
		serverUrl: endpoints.amplitudeServerUrl,
		trackingSessionEvents: false,
	}).promise;

	// Firebase: firebase.json turns automatic collection and every consent type
	// off before the native SDK starts, so this only connects the running instance.
	const analytics = getAnalytics();

	const integrations: Record<VendorName, ConsentIntegration> = {
		amplitude: connectAppAmplitude(amplitude, reporter('amplitude')),
		firebase: connectAppFirebaseAnalytics(
			{
				setAnalyticsCollectionEnabled: (enabled) =>
					setAnalyticsCollectionEnabled(analytics, enabled),
				setConsent: (settings) => setConsent(analytics, settings),
			},
			reporter('firebase')
		),
		mixpanel: connectAppMixpanel(mixpanel, reporter('mixpanel')),
		posthog: connectAppPostHog(posthog, reporter('posthog')),
		sentry: connectAppSentryReplay(replay, reporter('sentry')),
	};

	await Promise.allSettled(
		VENDOR_NAMES.map((vendor) => integrations[vendor].ready)
	);

	const probe = async (name: string): Promise<VendorProbeResult> => {
		const errors: Partial<Record<VendorName, string>> = {};
		const attempt = async (
			vendor: VendorName,
			work: () => unknown
		): Promise<void> => {
			try {
				await withTimeout(Promise.resolve(work()), vendor);
			} catch (error: unknown) {
				errors[vendor] = describe(error);
			}
		};

		// A grant or withdrawal reaches each integration through its own queue,
		// which can still be running when the journey asks for a probe. `sync()`
		// queues behind it and re-applies the current decision, so every SDK
		// reflects the step's consent before the event is sent.
		await Promise.all(
			VENDOR_NAMES.map((vendor) =>
				attempt(vendor, () => integrations[vendor].sync())
			)
		);
		const startedAt = Date.now();

		await Promise.all([
			attempt('posthog', async () => {
				posthog.capture(name);
				await posthog.flush();
			}),
			attempt('mixpanel', () => {
				mixpanel.track(name);
				// Mixpanel's RN flush returns void; the native upload runs on its own.
				mixpanel.flush();
			}),
			attempt('amplitude', async () => {
				// The track promise resolves only after a send, so it is not awaited.
				void amplitude.track(name).promise;
				await amplitude.flush().promise;
			}),
			attempt('sentry', async () => {
				Sentry.addBreadcrumb({ category: 'inth.probe', message: name });
				await Sentry.flush();
			}),
			// The modular API is typed void, matching the web SDK.
			attempt('firebase', () => logEvent(analytics, name)),
		]);

		return { errors, finishedAt: Date.now(), name, startedAt };
	};

	return { integrations, probe };
};
