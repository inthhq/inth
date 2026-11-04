/**
 * App E2E only: start the real vendor SDKs and report each probe to the backend.
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

const enabled = process.env.C15T_APP_E2E === '1';
const endpoint = process.env.C15T_E2E_URL || 'http://localhost:3000';
// Android sets the emulator's host alias; Mixpanel refuses loopback hosts there.
const mixpanelEndpoint = process.env.C15T_E2E_MIXPANEL_URL || endpoint;
const session = `${Date.now()}-${Math.random()}`;

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

const startVendors = async (): Promise<RealVendorSdks | null> => {
	try {
		return await startRealVendorSdks({
			baseUrl: endpoint,
			logging: true,
			mixpanelBaseUrl: mixpanelEndpoint,
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
const startOnce = (): Promise<void> => {
	if (startup === undefined) {
		sdks = startVendors();
		startup = runProbe('startup');
	}
	return startup;
};

/**
 * Start the vendors and the startup probe in an E2E build.
 *
 * @returns Whether the startup probe has been reported, which outside E2E is
 *   always true, and a function that sends one more probe.
 */
export const useE2eVendorProbe = (): {
	readonly probe: () => void;
	readonly startupSettled: boolean;
} => {
	const [startupSettled, setStartupSettled] = useState(!enabled);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		let mounted = true;
		const settle = async (): Promise<void> => {
			try {
				await startOnce();
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
	}, []);

	const probe = useCallback(() => {
		void runProbe('button');
	}, []);

	return { probe, startupSettled };
};
