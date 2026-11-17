/**
 * Angular conformance entry point.
 *
 * Drives the shared `runConformanceSuite` against real Angular
 * applications:
 * - `mount` boots the fixture with `createApplication` under
 *   `provideC15t()`, rendering the components registered for the requested
 *   kind in `conformance-registry.ts`.
 * - `getStore` projects the provider's live kernel snapshot into the
 *   v2-compatible shape the shared suite asserts.
 * - `serverRender` renders the same fixture with `renderApplication` from
 *   `@angular/platform-server`, in this process.
 *
 * To add a component, register it in `conformance-registry.ts`; this file
 * does not change.
 */
import {
	DriverNotImplementedError,
	IAB_FIXTURE_CMP_ID,
	IAB_FIXTURE_CMP_VERSION,
	MINIMAL_GVL,
	runConformanceSuite,
} from '@c15t/conformance';
import type {
	MountableComponent,
	MountOptions,
	MountResult,
	SuiteApi,
	TestDriver,
} from '@c15t/conformance';
import { deferInitGvl } from '@c15t/core';
import type {
	AllConsentNames,
	ConsentKernel,
	InitResponse,
	KernelActiveUI,
	KernelConfig,
} from '@c15t/core';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import type { GlobalVendorList } from '@c15t/schema/types';
import { describe, expect, test } from 'vitest';

import { testing } from '../../testing/src/testing-mode';
import { whenIABReady } from '../lib/core/iab-loader';
import type { C15tOptions, C15tProviderOptions } from '../lib/core/options';
import { bootClient, renderServer } from './conformance-app';
import type { ClientApp } from './conformance-app';
import { CONFORMANCE_COMPONENTS } from './conformance-registry';
import { transportMode } from './fixtures/transport-mode';
import { createPolicySession, probePolicyContract } from './policy-driver';

type StoreState = Record<string, unknown> & {
	consents: Record<string, boolean>;
	selectedConsents: Record<string, boolean>;
	activeUI: 'none' | 'banner' | 'dialog';
	consentCategories: string[];
};

const DEFAULT_CONSENT_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const satisfies readonly AllConsentNames[];

const isIabComponent = function isIabComponent(
	component: MountableComponent
): boolean {
	return (
		component === 'iab-consent-banner' || component === 'iab-consent-dialog'
	);
};

/**
 * The registered components for a kind.
 *
 * @throws {DriverNotImplementedError} When nothing is registered for it.
 */
const entriesFor = function entriesFor(component: MountableComponent) {
	const entries = CONFORMANCE_COMPONENTS[component];
	if (!entries?.length) {
		throw new DriverNotImplementedError('angular', `mount(${component})`);
	}
	return entries;
};

const consentCategoriesFor = function consentCategoriesFor(
	options: Partial<C15tOptions>
) {
	return options.consentCategories?.length === 0
		? [...DEFAULT_CONSENT_CATEGORIES]
		: [...(options.consentCategories ?? DEFAULT_CONSENT_CATEGORIES)];
};

const buildProviderOptions = function buildProviderOptions(
	opts: MountOptions
): C15tOptions {
	const provided = (opts.providerOptions ?? {}) as Partial<C15tOptions>;
	const rule = normalizePolicyRule({
		categories: consentCategoriesFor(provided).filter(
			(name) => name !== 'necessary'
		),
		id: 'angular_conformance_policy',
		match: { fallback: true },
		model: isIabComponent(opts.component)
			? 'iab'
			: (opts.policy?.model ?? 'opt-in'),
		privacySignals: {
			gpc: {
				denyCategories: opts.policy?.respectGpc
					? ['marketing', 'measurement']
					: [],
			},
		},
		prompt: 'choice',
		scopeMode: 'permissive',
	});
	const resolution = {
		fingerprints: createPolicyRuleFingerprints(rule),
		matchedBy: 'fallback' as const,
		policy: rule,
		policyId: rule.id,
		status: 'matched' as const,
	};
	const authoritative =
		opts.initMode !== 'pending' && opts.initMode !== 'failing';
	const prefetch: KernelConfig = {
		...(provided.prefetch ?? {}),
		initialBranding: 'c15t',
		// A server that resolved an IAB policy ships the vendor list in the
		// state; the lazy `@c15t/iab` factory only seeds it on the client.
		initialIab:
			isIabComponent(opts.component) && authoritative
				? {
						cmpId: IAB_FIXTURE_CMP_ID,
						enabled: true,
						gvl: (opts.gvl ?? MINIMAL_GVL) as unknown as GlobalVendorList,
					}
				: undefined,
		initialPolicyPending: !authoritative,
		initialPolicyResolution: authoritative ? resolution : undefined,
		initialPrivacySignals: { gpc: opts.gpc },
	};

	const options = {
		...provided,
		consentCategories: consentCategoriesFor(provided),
		disableAnimation: provided.disableAnimation ?? true,
		...(provided.mode
			? { mode: provided.mode }
			: { mode: testing() }),
		persistence: opts.persistence ?? provided.persistence ?? false,
		prefetch,
		trapFocus: provided.trapFocus ?? false,
	} as C15tOptions;
	// Real IAB wiring: the provider turns this into `createIAB`, which seeds
	// the kernel's IAB slice (enabled + GVL + CMP id).
	if (isIabComponent(opts.component)) {
		options.iab = {
			cmpId: IAB_FIXTURE_CMP_ID,
			cmpVersion: IAB_FIXTURE_CMP_VERSION,
			enabled: true,
			gvl: (opts.gvl ?? MINIMAL_GVL) as unknown as GlobalVendorList,
		};
	}
	return options;
};

const activeUIForStore = function activeUIForStore(
	activeUI: KernelActiveUI
): StoreState['activeUI'] {
	if (activeUI === 'banner' || activeUI === 'dialog') {
		return activeUI;
	}
	return 'none';
};

const projectStoreState = function projectStoreState(
	kernel: ConsentKernel
): StoreState {
	const snapshot = kernel.getSnapshot();
	const consents = { ...snapshot.effectivePermissions } as Record<
		string,
		boolean
	>;
	return {
		...(snapshot as unknown as Record<string, unknown>),
		activeUI: activeUIForStore(snapshot.activeUI),
		consentCategories: [...snapshot.policyRule.scope],
		consents,
		selectedConsents: { ...consents },
	};
};

const settle = async () => {
	// oxlint-disable-next-line promise/avoid-new -- A timer is the settle point.
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
};

let lastApp: ClientApp | null = null;

const driver: TestDriver = {
	createPolicySession,
	framework: 'angular',
	getStore() {
		if (!lastApp) {
			throw new Error('Angular driver: getStore called before mount');
		}
		const { consent } = lastApp;
		return {
			getState: () => projectStoreState(consent.kernel()),
			subscribe: (listener) =>
				consent.kernel().subscribe(() => {
					listener();
				}),
		};
	},
	async mount(opts: MountOptions): Promise<MountResult> {
		const entries = entriesFor(opts.component);
		const options = buildProviderOptions(opts);
		let resolveInit: (() => void) | undefined;
		if (opts.initMode === 'pending') {
			const resolution = buildProviderOptions({
				...opts,
				initMode: 'authoritative',
			}).prefetch?.initialPolicyResolution;
			// oxlint-disable-next-line promise/avoid-new -- The test resolves init by hand.
			const promise = new Promise<InitResponse>((resolve) => {
				resolveInit = () =>
					resolve({
						policyResolution: writePolicyResolutionWire(
							resolution ?? { policy: null, status: 'unconfigured' }
						),
					});
			});
			options.mode = transportMode({ init: () => promise });
		} else if (opts.initMode === 'failing') {
			options.mode = transportMode({
				init: () => Promise.reject(new Error('Init failed')),
			});
		}

		const container = document.createElement('div');
		document.body.append(container);
		const app = await bootClient(container, options as C15tProviderOptions, {
			entries,
		});
		lastApp = app;

		if (isIabComponent(opts.component)) {
			// `@c15t/iab` loads on demand, so an IAB surface only has a live
			// handle once that import has settled.
			await whenIABReady();
		}
		await settle();
		await app.appRef.whenStable();

		return {
			resolveInit: resolveInit
				? async () => {
						resolveInit?.();
						await settle();
						await app.appRef.whenStable();
					}
				: undefined,
			root: container,
			unmount: () => {
				app.destroy();
				container.replaceChildren();
				container.remove();
				if (lastApp === app) {
					lastApp = null;
				}
			},
		};
	},
	probePolicyContract,
	async serverRender(opts: MountOptions): Promise<string> {
		const entries = entriesFor(opts.component);
		const options = buildProviderOptions(opts);
		if (options.iab) {
			options.iab.gvl = undefined;
		}
		if (options.prefetch?.initialIab?.gvl) {
			Object.assign(
				options.prefetch.initialIab,
				deferInitGvl({ gvl: options.prefetch.initialIab.gvl }, '/test-gvl')
			);
		}
		const rendered = await renderServer(options as C15tProviderOptions, {
			entries,
		});
		return rendered.html;
	},
};

const api: SuiteApi = {
	describe,
	expect: expect as unknown as SuiteApi['expect'],
	// oxlint-disable-next-line vitest/expect-expect -- The shared conformance suite supplies the assertions in body.
	test: (name, body) => test(name, body, 20_000),
};

runConformanceSuite(driver, api);
