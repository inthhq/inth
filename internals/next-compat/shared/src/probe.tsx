'use client';

import { useActiveUI, useSnapshot } from '@inth/nextjs';
import { useEffect } from 'react';

/**
 * Snapshot of consent runtime state that the compatibility suite reads
 * through `window.__inthCompat`.
 */
export interface CompatProbeState {
	scenario: string;
	activeUI: string;
	hasConsented: boolean;
	/** `true` once the kernel holds an authoritative policy. */
	hasPolicy: boolean;
	policyProvisional: boolean;
	countryCode: string | null;
	onConsentSetCount: number;
	onErrorCount: number;
}

declare global {
	interface Window {
		__inthCompat?: CompatProbeState;
		__inthCompatCounters?: Pick<
			CompatProbeState,
			'onConsentSetCount' | 'onErrorCount'
		>;
	}
}

export const getCompatCounters = function getCompatCounters() {
	if (typeof window === 'undefined') {
		return undefined;
	}
	window.__inthCompatCounters ??= {
		onConsentSetCount: 0,
		onErrorCount: 0,
	};
	return window.__inthCompatCounters;
};

export const CompatProbe = ({ scenario }: { scenario: string }) => {
	const activeUI = useActiveUI();
	const snapshot = useSnapshot();

	useEffect(() => {
		const counters = getCompatCounters();
		window.__inthCompat = {
			activeUI: activeUI ?? 'none',
			countryCode: snapshot.location?.countryCode ?? null,
			hasConsented: snapshot.explicitChoice !== null,
			hasPolicy: snapshot.resolution.status === 'matched',
			onConsentSetCount: counters?.onConsentSetCount ?? 0,
			onErrorCount: counters?.onErrorCount ?? 0,
			policyProvisional: snapshot.policyPending,
			scenario,
		};
	});

	return (
		<output
			data-scenario={scenario}
			data-testid="compat-probe"
		>
			{activeUI ?? 'none'}
		</output>
	);
};
