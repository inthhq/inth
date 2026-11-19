// Vite resolves this through the adapter's own React dependency, preserving
// the dependency graph used by baseline comparisons.
import { IABProvider, IABConsentBanner } from '@inth/react/iab';
import { hosted } from '@inth/sdk/engine';
import { createV1ManifestTransport } from '@inth/sdk/transports/manifest';
import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
} from '@inth/tanstack-start';
import type { WithProjectUrl, InthProviderProps } from '@inth/tanstack-start';
import { InthProvider as ReactProvider } from '@inth/tanstack-start/react';
import type { InthProviderOptions as ReactProviderOptions } from '@inth/tanstack-start/react';
import type { ConsentState } from '@inth/tanstack-start/server';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { TanstackBenchmarkProbe } from './probe';
import { getState } from './state';
import type { TanstackBenchScenario } from './state';

/** A transport factory that hands the provider `transport`. */
const customMode = <Transport,>(transport: Transport) =>
	Object.assign(() => transport, { kind: 'custom' as const });

const BENCH_BACKEND_URL = '/api/bench-consent';

const consentCategories = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] satisfies NonNullable<ReactProviderOptions['consentCategories']>;

const createOptions = function createOptions(
	scenario: TanstackBenchScenario
): WithProjectUrl<ReactProviderOptions> {
	return {
		callbacks: {
			onChoiceRecorded() {
				const state = getState(scenario);
				if (state) {
					state.onConsentSetCount += 1;
				}
			},
			onError() {
				const state = getState(scenario);
				if (state) {
					state.onErrorCount += 1;
				}
			},
		},
		consentCategories,
		mode: hosted(),
		projectUrl: BENCH_BACKEND_URL,
		theme: {
			motion: {
				duration: {
					fast: '1ms',
					normal: '1ms',
					slow: '1ms',
				},
			},
		},
	};
};

const createRootOptions = function createRootOptions(
	scenario: TanstackBenchScenario
): InthProviderProps['options'] {
	const { mode, ...options } = createOptions(scenario);
	void mode;
	return options;
};

const BenchmarkContents = ({
	children,
	scenario,
}: {
	children: ReactNode;
	scenario: TanstackBenchScenario;
}) => (
	<>
		<TanstackBenchmarkProbe scenario={scenario} />
		{import.meta.env.INTH_BENCH_IAB === '1' && (
			<IABProvider cmpId={28}>
				<IABConsentBanner disableAnimation />
			</IABProvider>
		)}
		<ConsentBanner disableAnimation />
		<ConsentDialog disableAnimation />
		{children}
	</>
);

/** `client` arm: hosted mode, init and saves go straight to the fixture. */
export const TanstackClientBenchmarkProvider = ({
	children,
	scenario,
}: {
	children: ReactNode;
	scenario: TanstackBenchScenario;
}) => (
	<ReactProvider options={createOptions(scenario)}>
		<BenchmarkContents scenario={scenario}>{children}</BenchmarkContents>
	</ReactProvider>
);

/**
 * `manifest-client` arm: the browser fetches the same-origin cached
 * manifest route and resolves init locally; saves go to the fixture.
 */
export const TanstackManifestClientBenchmarkProvider = ({
	children,
	scenario,
}: {
	children: ReactNode;
	scenario: TanstackBenchScenario;
}) => {
	const transport = useMemo(
		() =>
			createV1ManifestTransport({
				manifestUrl: '/api/inth/v1/consent/manifest',
				projectUrl: BENCH_BACKEND_URL,
			}),
		[]
	);

	return (
		<ReactProvider
			options={{
				...createOptions(scenario),
				mode: customMode(transport),
			}}
		>
			<BenchmarkContents scenario={scenario}>{children}</BenchmarkContents>
		</ReactProvider>
	);
};

/**
 * `ssr` arm: the loader already carries the init response and the backend
 * URL, so the root renders the banner into the first HTML. Without
 * `routePrefix`, any client refresh calls the backend's `/v1/consent/init` directly,
 * matching the Next arm.
 */
export const TanstackPrefetchedBenchmarkProvider = ({
	children,
	state,
	scenario,
}: {
	children: ReactNode;
	state: InthProviderProps['state'];
	scenario: TanstackBenchScenario;
}) => (
	<InthProvider
		state={state}
		options={createRootOptions(scenario)}
	>
		<BenchmarkContents scenario={scenario}>{children}</BenchmarkContents>
	</InthProvider>
);

/**
 * `manifest-ssr` and `manifest-ssr-proxy` arms: manifest-resolved
 * state plus the same-origin consent route under `routePrefix`, both
 * carried by the state. `projectUrl` decides where the accept click posts:
 * the fixture directly, or the proxy mount.
 */
export const TanstackManifestBenchmarkProvider = ({
	projectUrl = BENCH_BACKEND_URL,
	children,
	state,
	routePrefix = '/api/inth',
	scenario,
}: {
	projectUrl?: string;
	children: ReactNode;
	state: ConsentState;
	routePrefix?: string;
	scenario: TanstackBenchScenario;
}) => (
	<InthProvider
		state={{ ...state, projectUrl, routePrefix }}
		options={createRootOptions(scenario)}
	>
		<BenchmarkContents scenario={scenario}>{children}</BenchmarkContents>
	</InthProvider>
);
