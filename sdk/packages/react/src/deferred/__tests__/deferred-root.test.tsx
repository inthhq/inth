/**
 * A deferred root, end to end: the server renders the whole provider, the
 * banner and the boot data; the browser hydrates the page against the
 * stand-in kernel, keeps the banner's server HTML, and loads the engine
 * only when asked. Each test streams a real server render into an iframe
 * and hydrates it.
 */
import type { KernelConfig } from '@c15t/core';
import type { PolicyRule } from '@c15t/schema/types';
import { Suspense, act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { policyFixture } from '../../__tests__/policy-fixture';
import {
	BANNER,
	deferred,
	fulfilledThenable,
	streamPage,
} from '../../__tests__/streamed-ssr-harness';
import type { StreamedPage } from '../../__tests__/streamed-ssr-harness';
import { useSaveConsents, useSnapshot } from '../../hooks';
import { ConsentProvider, custom } from '../../index';
import { canDeferEngine, readConsentBoot } from '../boot';
import type { ConsentBoot } from '../boot';
import { ConsentBootData, ServerBootData } from '../boot-data';
import type * as EngineNamespace from '../engine';
import { ENGINE_CHUNKS_KEY } from '../engine-preload';
import { DeferredConsentShell } from '../shell';
import { DeferredConsentBanner } from '../surfaces';

const policyConfig = function policyConfig(
	rule: Partial<PolicyRule> = {},
	values: Parameters<typeof policyFixture>[0] = {}
): KernelConfig {
	return {
		initialBranding: 'c15t',
		initialLocation: { countryCode: 'DE', regionCode: null },
		initialOverrides: { country: 'DE', language: 'en' },
		...policyFixture(values, {
			categories: ['marketing'],
			id: 'gdpr',
			...rule,
		}),
	};
};

const transportInit = vi.fn(() => Promise.resolve({}));
const transportSave = vi.fn(() => Promise.resolve({ ok: true as const }));
const mode = custom({ init: transportInit, save: transportSave });
/** The categories the page uses, as the CookieBench fixture names them. */
const consentCategories = ['necessary', 'marketing'] as const;

/** Page content that reads consent and saves it, outside the banner. */
const Probe = () => {
	const snapshot = useSnapshot();
	const save = useSaveConsents();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
		>
			<button
				id="save-all"
				onClick={() => {
					void save('all');
				}}
				type="button"
			>
				Accept from the page
			</button>
		</main>
	);
};

const ServerPage = ({ prefetch }: { prefetch: unknown }) => (
	<html lang="en">
		<head />
		<body>
			<ConsentProvider
				options={{
					consentCategories,
					mode,
					persistence: false,
					prefetch: prefetch as KernelConfig,
				}}
			>
				<Probe />
				<DeferredConsentBanner />
				<Suspense fallback={null}>
					<ServerBootData />
				</Suspense>
			</ConsentProvider>
		</body>
	</html>
);

type EngineModule = typeof EngineNamespace;

const ClientPage = ({
	boot,
	defer,
	loadEngine,
	prefetch,
	schedule,
}: {
	boot: ConsentBoot;
	defer: boolean;
	loadEngine: () => Promise<EngineModule>;
	prefetch: unknown;
	schedule?: (start: () => void) => () => void;
}) => (
	<html lang="en">
		<head />
		<body>
			<DeferredConsentShell
				boot={boot}
				defer={defer}
				loadEngine={loadEngine}
				options={{ consentCategories }}
				prefetch={prefetch}
				renderEngine={(engine: EngineModule, attach) => (
					<engine.DeferredEngineHost
						attach={attach}
						options={{
							consentCategories,
							mode,
							persistence: false,
							prefetch: prefetch as KernelConfig,
						}}
					>
						<ConsentBootData />
					</engine.DeferredEngineHost>
				)}
				schedule={schedule}
			>
				<Probe />
				<DeferredConsentBanner />
			</DeferredConsentShell>
		</body>
	</html>
);

const tick = (ms = 50) =>
	act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			})
	);

let page: StreamedPage | undefined;

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	transportInit.mockClear();
	transportSave.mockClear();
});

afterEach(() => {
	page?.dispose();
	page = undefined;
});

/** Whether the server left the engine preload after the boot data. */
const hasEnginePreload = (doc: Document): boolean =>
	Array.from(doc.querySelectorAll('script:not([type])')).some((script) =>
		script.textContent?.includes(ENGINE_CHUNKS_KEY)
	);

/** Streams the server render with a streamed state, then reads its boot data. */
const serve = async function serve(config: KernelConfig) {
	const server = deferred<KernelConfig>();
	page = await streamPage(<ServerPage prefetch={server.promise} />);
	server.resolve(config);
	await page.finish();
	const boot = readConsentBoot(page.doc);
	expect(page.serverErrors).toEqual([]);
	expect(boot).not.toBeNull();
	return { boot: boot as ConsentBoot, page };
};

const reactProps = (element: Element | null | undefined): boolean =>
	Boolean(
		element &&
		Object.keys(element).some((key) => key.startsWith('__reactProps'))
	);

test('a fresh visitor: the page hydrates at once, the banner keeps its server HTML, and the engine waits', async () => {
	const config = policyConfig();
	const { boot, page: streamed } = await serve(config);
	// The children rendered before the state resolved; the banner after.
	expect(boot.s.activeUI).toBe('none');
	expect(boot.r?.activeUI).toBe('banner');
	expect(canDeferEngine(boot.r ?? boot.s)).toBe(true);
	// The engine waits: nothing preloads it.
	expect(hasEnginePreload(streamed.doc)).toBe(false);

	const loadEngine = vi.fn(() => import('../engine'));
	const schedule = vi.fn(() => () => undefined);
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
			schedule={schedule}
		/>
	);
	await tick(100);

	expect(hydrated.recoverableErrors).toEqual([]);
	expect(schedule).toHaveBeenCalledTimes(1);
	expect(loadEngine).not.toHaveBeenCalled();
	const main = streamed.doc.querySelector('main');
	// Hydrated, and past hydration it reads the resolved server state.
	expect(reactProps(streamed.doc.getElementById('save-all'))).toBe(true);
	expect(main?.dataset.activeUi).toBe('banner');
	expect(main?.dataset.marketing).toBe('false');
	// The banner is the server's markup, not yet React's.
	const accept = streamed.doc.querySelector(
		`${BANNER} [data-testid="consent-banner-accept-button"]`
	);
	expect(accept).not.toBeNull();
	expect(reactProps(accept)).toBe(false);

	// An action from the page loads the engine and runs on it.
	await act(() => {
		(streamed.doc.getElementById('save-all') as HTMLButtonElement).click();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	expect(loadEngine).toHaveBeenCalledTimes(1);
	await vi.waitFor(() => {
		expect(main?.dataset.marketing).toBe('true');
		expect(streamed.doc.querySelector(BANNER)).toBeNull();
	});
	expect(hydrated.recoverableErrors).toEqual([]);
	await hydrated.unmount();
});

test('once the engine loads unprompted, the banner hydrates in place and works', async () => {
	const config = policyConfig();
	const { boot, page: streamed } = await serve(config);
	let start: () => void = () => undefined;
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer
			loadEngine={() => import('../engine')}
			prefetch={fulfilledThenable(config)}
			schedule={(begin) => {
				start = begin;
				return () => undefined;
			}}
		/>
	);
	const banner = streamed.doc.querySelector(BANNER);
	await act(() => {
		start();
	});
	await vi.waitFor(() => {
		expect(
			reactProps(
				streamed.doc.querySelector(
					'[data-testid="consent-banner-accept-button"]'
				)
			)
		).toBe(true);
	});
	// The same element: hydrated, not replaced.
	expect(streamed.doc.querySelector(BANNER)).toBe(banner);
	expect(hydrated.recoverableErrors).toEqual([]);

	await act(() => {
		(
			streamed.doc.querySelector(
				'[data-testid="consent-banner-accept-button"]'
			) as HTMLButtonElement
		).click();
	});
	await vi.waitFor(() => {
		expect(transportSave).toHaveBeenCalledTimes(1);
	});
	await vi.waitFor(() => {
		expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	});
	await hydrated.unmount();
});

test('a returning visitor with consent: the engine loads during hydration', async () => {
	const config = policyConfig({}, { marketing: true });
	const { boot, page: streamed } = await serve(config);
	expect(canDeferEngine(boot.r ?? boot.s)).toBe(false);
	expect(hasEnginePreload(streamed.doc)).toBe(true);

	const loadEngine = vi.fn(() => import('../engine'));
	const hydrated = await streamed.hydrate(
		<ClientPage
			boot={boot}
			defer={false}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(config)}
		/>
	);
	expect(loadEngine).toHaveBeenCalledTimes(1);
	expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	await tick(100);
	expect(hydrated.recoverableErrors).toEqual([]);
	expect(streamed.doc.querySelector('main')?.dataset.marketing).toBe('true');
	await hydrated.unmount();
});
