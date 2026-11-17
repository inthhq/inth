/**
 * App E2E only: start the real vendor SDKs and report each probe to the backend.
 *
 * Shared with the Expo fixture, which imports this file. Each app passes its own
 * {@link E2eVendorProbeSettings}, because bare RN and Expo inline different
 * environment variables into the bundle.
 *
 * Every launch sends one startup probe once the c15t connections have applied
 * their first state, before the consent prompt is presented. That covers a fresh
 * install and a relaunch with a saved refusal, and on Android it runs before the
 * prompt's Activity pauses JavaScript timers. Later probes come from the
 * `fixture.vendor-probe` button. The native journeys read the reports from
 * `/e2e/state` and the vendor traffic from `/captured`.
 */

import { getConsentClient } from '@c15t/react-native';
import { useCallback, useEffect, useState } from 'react';

import { startRealVendorSdks } from './real-sdks';
import type {
	RealVendorSdks,
	VendorName,
	VendorProbeResult,
} from './real-sdks';

/** Where the E2E backend is, and whether this build runs the vendor probe at all. */
export interface E2eVendorProbeSettings {
	/** Only E2E builds start the vendor SDKs. */
	readonly enabled: boolean;
	/** E2E backend origin, such as `http://localhost:3000`. */
	readonly endpoint: string;
	/**
	 * Origin for Mixpanel only. Android passes the emulator's host alias, because
	 * Mixpanel refuses loopback hosts there. Defaults to `endpoint`.
	 */
	readonly mixpanelEndpoint?: string;
}

const session = `${Date.now()}-${Math.random()}`;
// The settings of the first caller, kept for the life of the JavaScript runtime.
let endpoint = 'http://localhost:3000';

type ProbeReason = 'startup' | 'button';

const report = async (body: Record<string, unknown>): Promise<void> => {
	await fetch(`${endpoint}/e2e/vendor-probe`, {
		body: JSON.stringify({ session, ...body }),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	}).catch((error: unknown) => {
		console.error('E2E vendor probe report', error);
	});
};

const integrationErrors: Partial<Record<VendorName, string>> = {};
let startFailure: string | undefined;
let sdks: Promise<RealVendorSdks | null> | undefined;
let probes = 0;

const runProbe = async (reason: ProbeReason): Promise<void> => {
	const running = await sdks;
	probes += 1;
	// Firebase event names allow letters, digits and underscores, up to 40.
	const name = `c15t_probe_${Date.now()}_${probes}`;
	if (running === null || running === undefined) {
		await report({
			errors: integrationErrors,
			name,
			reason,
			startFailure: startFailure ?? 'not started',
			started: false,
		});
		return;
	}
	const result: VendorProbeResult = await running.probe(name);
	await report({
		...result,
		errors: { ...integrationErrors, ...result.errors },
		measurementAllowed: getConsentClient().isAllowed('measurement'),
		reason,
		started: true,
	});
};

const startVendors = async (
	settings: E2eVendorProbeSettings
): Promise<RealVendorSdks | null> => {
	try {
		return await startRealVendorSdks({
			baseUrl: settings.endpoint,
			logging: true,
			mixpanelBaseUrl: settings.mixpanelEndpoint ?? settings.endpoint,
			onError: (vendor, error) => {
				integrationErrors[vendor] =
					error instanceof Error ? error.message : String(error);
			},
		});
	} catch (error: unknown) {
		startFailure =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		return null;
	}
};

let startup: Promise<void> | undefined;

/** Start the SDKs and send the startup probe, once per JavaScript runtime. */
const startOnce = (settings: E2eVendorProbeSettings): Promise<void> => {
	if (startup === undefined) {
		({ endpoint } = settings);
		sdks = startVendors(settings);
		startup = runProbe('startup');
	}
	return startup;
};

/**
 * Start the vendors and the startup probe in an E2E build.
 *
 * @param settings - The E2E backend, from the app's build-time configuration.
 * @returns Whether the startup probe has been reported, which outside E2E is
 *   always true, and a function that sends one more probe.
 */
export const useE2eVendorProbe = (
	settings: E2eVendorProbeSettings
): {
	readonly probe: () => void;
	readonly startupSettled: boolean;
} => {
	const [startupSettled, setStartupSettled] = useState(!settings.enabled);

	// Pass a module constant: the SDKs start once per JavaScript runtime.
	useEffect(() => {
		if (!settings.enabled) {
			return;
		}
		let mounted = true;
		const settle = async (): Promise<void> => {
			try {
				await startOnce(settings);
			} catch (error: unknown) {
				// The journey reads the missing report; the prompt must still appear.
				console.error('E2E vendor startup probe', error);
			}
			if (mounted) {
				setStartupSettled(true);
			}
		};
		void settle();
		return () => {
			mounted = false;
		};
	}, [settings]);

	const probe = useCallback(() => {
		void runProbe('button');
	}, []);

	return { probe, startupSettled };
};
