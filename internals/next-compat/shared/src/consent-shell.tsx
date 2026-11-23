'use client';

import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
	defineConsentConfig,
	hosted,
} from '@inth/nextjs';
import type { ConsentConfig, InthProviderProps } from '@inth/nextjs';
import { ConsentDialogLink } from '@inth/nextjs/components/consent-dialog-link';
import { manifest as browserManifest } from '@inth/sdk/transports/manifest-browser';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import {
	COMPAT_BACKEND_URL,
	COMPAT_CONSENT_CONFIG,
	COMPAT_HOSTED_CONFIG,
	COMPAT_MANIFEST_URL,
} from './config';
import { CompatProbe, getCompatCounters } from './probe';
import { createStaticTransport } from './static-transport';
import type { CompatManifest } from './static-transport';

/** A transport factory that hands the provider `transport`. */
const customMode = <Transport,>(transport: Transport) =>
	Object.assign(() => transport, { kind: 'custom' as const });

export interface ConsentShellProps {
	children?: ReactNode;
	scenario: string;
	/**
	 * Server-resolved consent state from `resolveConsent()`. Omitted on
	 * routes that init in the browser.
	 */
	state?: InthProviderProps['state'];
	projectUrl?: string;
	/**
	 * `hosted` calls the backend `/init`; `manifest` resolves init in the
	 * browser from the same-origin manifest route and never calls `/init`;
	 * `static` resolves init from the `manifest` prop, a module generated at
	 * build time for `output: 'export'` apps, and fetches nothing.
	 */
	transport?: 'hosted' | 'manifest' | 'manifest-geo' | 'static';
	/** Required with `transport="static"`. */
	manifest?: CompatManifest;
	networkBlocker?: InthProviderProps['networkBlocker'];
	/** CSP nonce for automatic component styles in the nonce test routes. */
	nonce?: string;
	/**
	 * `false` in the cells that import `@inth/nextjs/styles.css`, so the
	 * components do not deliver a second copy of its rules.
	 */
	styles?: boolean;
}

const createMode = function createMode({
	projectUrl,
	manifest,
	transport,
}: Required<Pick<ConsentShellProps, 'projectUrl' | 'transport'>> &
	Pick<ConsentShellProps, 'manifest'>) {
	switch (transport) {
		case 'manifest-geo': {
			// Selection comes from the root's `config`.
			return undefined;
		}
		case 'manifest': {
			// The scenario claims the backend never sees init, so a policy
			// that depends on location resolves for an unknown one.
			return browserManifest({
				initFallback: false,
				manifestUrl: COMPAT_MANIFEST_URL,
				projectUrl,
			});
		}
		case 'static': {
			if (!manifest) {
				throw new Error('ConsentShell: transport="static" needs a manifest');
			}
			return customMode(createStaticTransport({ manifest, projectUrl }));
		}
		default: {
			return undefined;
		}
	}
};

/**
 * The root's config. `manifest-geo` uses the manifest config with the app's
 * consent route; the other transports use hosted mode against `projectUrl`,
 * which `options.mode` replaces for `manifest` and `static`.
 */
const createConfig = function createConfig(
	projectUrl: string,
	transport: NonNullable<ConsentShellProps['transport']>
): ConsentConfig {
	if (transport === 'manifest-geo') {
		return COMPAT_CONSENT_CONFIG;
	}
	if (projectUrl === COMPAT_BACKEND_URL) {
		return COMPAT_HOSTED_CONFIG;
	}
	return defineConsentConfig({ mode: hosted(), projectUrl });
};

/**
 * The client-side provider tree every fixture route mounts.
 *
 * @remarks
 * Kept identical across routers and Next.js versions so a failing cell
 * points at the framework combination, not at fixture drift. Mirrors the
 * v3 pattern: one `InthProvider`, hosted mode against `projectUrl` by
 * default, and the server state (when any) passed as a plain prop. No cell
 * has a `inth.config.ts`, so the shell passes `config` itself.
 */
export const ConsentShell = ({
	children,
	scenario,
	state,
	projectUrl = COMPAT_BACKEND_URL,
	transport = 'hosted',
	manifest,
	networkBlocker,
	nonce,
	styles = true,
}: ConsentShellProps) => {
	const mode = useMemo(
		() => createMode({ manifest, projectUrl, transport }),
		[projectUrl, manifest, transport]
	);
	const config = useMemo(
		() => createConfig(projectUrl, transport),
		[projectUrl, transport]
	);

	return (
		<InthProvider
			config={config}
			networkBlocker={networkBlocker}
			state={state ?? {}}
			options={{
				callbacks: {
					onChoiceRecorded() {
						const counters = getCompatCounters();
						if (counters) {
							counters.onConsentSetCount += 1;
						}
					},
					onError() {
						const counters = getCompatCounters();
						if (counters) {
							counters.onErrorCount += 1;
						}
					},
				},
				consentCategories: ['necessary', 'measurement', 'marketing'],
				mode,
				nonce,
				styles,
				theme: {
					motion: {
						duration: { fast: '1ms', normal: '1ms', slow: '1ms' },
					},
				},
			}}
		>
			<CompatProbe scenario={scenario} />
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
			<main
				data-scenario={scenario}
				data-testid="compat-main"
			>
				<h1>next-compat: {scenario}</h1>
				{children}
			</main>
			<footer>
				<ConsentDialogLink>Privacy settings</ConsentDialogLink>
			</footer>
		</InthProvider>
	);
};
