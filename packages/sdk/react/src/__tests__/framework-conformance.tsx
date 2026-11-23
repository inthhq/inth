import {
	IAB_FIXTURE_CMP_ID,
	IAB_FIXTURE_CMP_VERSION,
	MINIMAL_GVL,
	runConformanceSuite,
} from '@inth/conformance';
import type {
	MountableComponent,
	MountOptions,
	MountResult,
	SuiteApi,
	TestDriver,
} from '@inth/conformance';
import type {
	CreatePolicySession,
	ProbePolicyContract,
} from '@inth/conformance/contract/policy-driver';
import { ConsentDialog, ConsentWidget, ConsentBanner } from '@inth/react';
import type { InthProviderOptions } from '@inth/react';
import { KernelContext } from '@inth/react/context';
import {
	IABProvider,
	IABConsentBanner,
	IABConsentDialog,
} from '@inth/react/iab';
import { deferInitGvl } from '@inth/sdk/engine';
import type {
	AllConsentNames,
	ConsentKernel,
	KernelActiveUI,
	TranslationsResponse,
} from '@inth/sdk/engine';
import { writePolicyResolutionWire } from '@inth/sdk/schema/types';
import type { GlobalVendorList } from '@inth/sdk/schema/types';
import { useContext, useEffect } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { testing } from '../testing';
import { transportMode } from './fixtures/transport-mode';
import type { FrameworkRoot } from './framework-root';
import type { policyFixture as PolicyFixture } from './policy-fixture';

/** Runs the same assertions against each framework's own boundary. */
export const runFrameworkConformance = ({
	Root: InthProvider,
	framework,
	policyFixture,
	createPolicySession,
	probePolicyContract,
}: {
	Root: FrameworkRoot;
	framework: TestDriver['framework'];
	policyFixture: typeof PolicyFixture;
	createPolicySession: CreatePolicySession;
	probePolicyContract: ProbePolicyContract;
}) => {
	type ProviderOptions = InthProviderOptions & {
		i18n?: {
			locale?: string;
			messages?: Record<string, Partial<TranslationsResponse>>;
		};
		initialTranslationConfig?: {
			defaultLanguage?: string;
			translations?: Record<string, Partial<TranslationsResponse>> | null;
		};
	};

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

	const DEFAULT_TRANSLATIONS: TranslationsResponse = {
		common: {
			acceptAll: 'Accept all',
			customize: 'Customize',
			rejectAll: 'Reject all',
			save: 'Save',
		},
		consentGate: {
			actionButton: 'Manage',
			title: 'Privacy',
		},
		consentManagerDialog: {
			description: 'Manage your choices.',
			title: 'Privacy preferences',
		},
		consentTypes: {
			experience: {
				description: 'Experience cookies.',
				title: 'Experience',
			},
			functionality: {
				description: 'Feature cookies.',
				title: 'Functionality',
			},
			marketing: {
				description: 'Targeted advertising.',
				title: 'Marketing',
			},
			measurement: {
				description: 'Analytics and performance measurement.',
				title: 'Measurement',
			},
			necessary: {
				description: 'Required for the site to function.',
				title: 'Necessary',
			},
		},
		cookieBanner: {
			description: 'We use cookies to enhance your experience.',
			title: 'We value your privacy',
		},
		legalLinks: {
			cookiePolicy: 'Cookie policy',
			privacyPolicy: 'Privacy policy',
			termsOfService: 'Terms of service',
		},
	};

	const mergeTranslations = function mergeTranslations(
		base: TranslationsResponse,
		override: Partial<TranslationsResponse> | undefined
	): TranslationsResponse {
		if (!override || typeof override !== 'object') {
			return base;
		}
		return {
			...base,
			...override,
			common: { ...base.common, ...override.common },
			consentGate: { ...base.consentGate, ...override.consentGate },
			consentManagerDialog: {
				...base.consentManagerDialog,
				...override.consentManagerDialog,
			},
			consentTypes: {
				...base.consentTypes,
				...override.consentTypes,
			},
			cookieBanner: { ...base.cookieBanner, ...override.cookieBanner },
			legalLinks: { ...base.legalLinks, ...override.legalLinks },
		};
	};

	const resolveTranslations = function resolveTranslations(
		options: ProviderOptions,
		locale?: string
	) {
		const language =
			locale ??
			options.i18n?.locale ??
			options.initialTranslationConfig?.defaultLanguage ??
			'en';
		const messages = options.i18n?.messages;
		const legacyMessages = options.initialTranslationConfig?.translations;
		const override =
			messages?.[language] ??
			messages?.en ??
			(legacyMessages && typeof legacyMessages === 'object'
				? (legacyMessages[language] ?? legacyMessages.en)
				: undefined);

		return {
			language,
			translations: mergeTranslations(DEFAULT_TRANSLATIONS, override),
		};
	};

	const consentCategoriesFor = function consentCategoriesFor(
		options: ProviderOptions
	): AllConsentNames[] {
		return options.consentCategories?.length === 0
			? [...DEFAULT_CONSENT_CATEGORIES]
			: [...(options.consentCategories ?? DEFAULT_CONSENT_CATEGORIES)];
	};

	const isIabComponent = function isIabComponent(
		component: MountableComponent
	): boolean {
		return (
			component === 'iab-consent-banner' || component === 'iab-consent-dialog'
		);
	};

	const activeUIForComponent = function activeUIForComponent(
		component: MountableComponent
	): KernelActiveUI {
		switch (component) {
			case 'consent-dialog':
			case 'consent-widget':
			case 'iab-consent-dialog':
				return 'dialog';
			case 'consent-banner':
			case 'iab-consent-banner':
				return 'banner';
			default:
				throw new Error(`Unsupported component: ${component}`);
		}
	};

	const buildProviderOptions = (opts: MountOptions): InthProviderOptions => {
		const provided = (opts.providerOptions ?? {}) as ProviderOptions;
		const state = opts.initialState as
			| { consents?: Record<string, boolean> }
			| undefined;
		const prepared = policyFixture(state?.consents, {
			categories: consentCategoriesFor(provided).filter(
				(category) => category !== 'necessary'
			),
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
			scopeMode: 'strict',
		});
		const authoritative =
			(opts.initMode ?? 'authoritative') === 'authoritative';
		return {
			// A real reload restarts the browser test page.
			reloadOnConsentRevoked: false,
			...provided,
			disableAnimation: true,
			mode: testing(),
			persistence: opts.persistence ?? false,
			prefetch: {
				...prepared,
				...provided.prefetch,
				// A server that resolved an IAB policy ships the vendor list in
				// the state, which is what lets the IAB banner server-render.
				initialIab:
					isIabComponent(opts.component) && authoritative
						? {
								cmpId: IAB_FIXTURE_CMP_ID,
								enabled: true,
								gvl: (opts.gvl ?? MINIMAL_GVL) as unknown as GlobalVendorList,
							}
						: undefined,
				initialPolicyPending: !authoritative,
				initialPolicyResolution: authoritative
					? prepared.initialPolicyResolution
					: undefined,
				initialPrivacySignals: { gpc: opts.gpc },
				initialTranslations: resolveTranslations(provided, opts.locale),
			},
			trapFocus: provided.trapFocus ?? false,
		};
	};

	const createPendingInit = function createPendingInit() {
		let resolve!: () => void;
		const promise = new Promise<{ policyResolution: unknown }>((_resolve) => {
			resolve = () =>
				_resolve({
					policyResolution: writePolicyResolutionWire(
						policyFixture().initialPolicyResolution ?? {
							policy: null,
							status: 'unconfigured',
						}
					),
				});
		});
		return { promise, resolve };
	};

	const lifecycleTransportFor = function lifecycleTransportFor(
		opts: MountOptions
	) {
		if ((opts.initMode ?? 'authoritative') === 'pending') {
			const deferred = createPendingInit();
			return {
				resolve: deferred.resolve,
				transport: {
					init: () => deferred.promise,
				},
			};
		}
		if (opts.initMode === 'failing') {
			return {
				resolve: undefined,
				transport: {
					init: () => Promise.reject(new Error('conformance: init failed')),
				},
			};
		}
		return { resolve: undefined, transport: undefined };
	};

	const flushScheduler = async function flushScheduler() {
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	};

	const KernelCapture = ({
		onKernel,
	}: {
		onKernel: (kernel: ConsentKernel) => void;
	}) => {
		const kernel = useContext(KernelContext);
		if (!kernel) {
			throw new Error('Next.js driver: missing kernel context');
		}
		useEffect(() => onKernel(kernel), [kernel, onKernel]);
		return null;
	};

	const componentFor = function componentFor(opts: MountOptions): ReactElement {
		const provided = (opts.providerOptions ?? {}) as ProviderOptions;
		const trapFocus = provided.trapFocus ?? false;

		switch (opts.component) {
			case 'consent-banner':
				return (
					<>
						<ConsentBanner
							disableAnimation
							blockUntilChoice={trapFocus}
							hideBranding
						/>
						<ConsentDialog disableAnimation />
					</>
				);
			case 'consent-dialog':
				return <ConsentDialog disableAnimation />;
			case 'consent-widget':
				return <ConsentWidget hideBranding />;
			case 'iab-consent-banner':
				return <IABConsentBanner />;
			case 'iab-consent-dialog':
				return <IABConsentDialog />;
			default:
				throw new Error(`Unsupported component: ${opts.component}`);
		}
	};

	const Harness = ({
		opts,
		onKernel,
	}: {
		opts: MountOptions;
		onKernel: (kernel: ConsentKernel) => void;
	}) => (
		<div
			data-testid="react-v3-conformance-root"
			dir={opts.locale === 'ar' ? 'rtl' : undefined}
		>
			<KernelCapture onKernel={onKernel} />
			{componentFor(opts)}
		</div>
	);

	const ClientSettled = ({ onSettled }: { onSettled: () => void }) => {
		useEffect(() => {
			onSettled();
		}, [onSettled]);
		return null;
	};

	const renderTree = function renderTree(
		opts: MountOptions,
		options: InthProviderOptions,
		onKernel: (kernel: ConsentKernel) => void,
		onSettled?: () => void
	) {
		const content = (
			<Harness
				opts={opts}
				onKernel={onKernel}
			/>
		);
		return (
			<InthProvider
				state={options.prefetch ?? {}}
				options={options}
				persistence={options.persistence}
			>
				{onSettled ? <ClientSettled onSettled={onSettled} /> : null}
				{isIabComponent(opts.component) ? (
					<IABProvider
						cmpId={IAB_FIXTURE_CMP_ID}
						cmpVersion={IAB_FIXTURE_CMP_VERSION}
						gvl={(opts.gvl ?? MINIMAL_GVL) as unknown as GlobalVendorList}
					>
						{content}
					</IABProvider>
				) : (
					content
				)}
			</InthProvider>
		);
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
			consentCategories: ['necessary', ...snapshot.policyRule.scope],
			consents,
			selectedConsents: { ...consents },
		};
	};

	let lastKernel: ConsentKernel | null = null;

	const driver: TestDriver = {
		createPolicySession,
		framework,
		getStore() {
			if (!lastKernel) {
				throw new Error(`${framework} driver: getStore called before mount`);
			}
			return {
				getState: () => projectStoreState(lastKernel as ConsentKernel),
				subscribe: (listener) =>
					(lastKernel as ConsentKernel).subscribe(() => {
						listener();
					}),
			};
		},
		async mount(opts: MountOptions): Promise<MountResult> {
			const lifecycle = lifecycleTransportFor(opts);
			const options = buildProviderOptions(opts);
			if (lifecycle.transport) {
				options.mode = transportMode(lifecycle.transport);
			}
			let mountedKernel: ConsentKernel | null = null;
			let resolveSettled: () => void = () => {};
			const settled = new Promise<void>((resolve) => {
				resolveSettled = resolve;
			});

			const container = document.createElement('div');
			document.body.appendChild(container);

			const root: Root = createRoot(container);
			root.render(
				renderTree(
					opts,
					options,
					(kernel) => {
						mountedKernel = kernel;
						lastKernel = kernel;
						if (activeUIForComponent(opts.component) === 'dialog') {
							kernel.set.activeUI('dialog');
						}
					},
					resolveSettled
				)
			);
			await settled;
			await flushScheduler();
			// The widget renders only once a policy is resolved, so a pending or
			// failing init has no widget root to wait for; the suite drives
			// `resolveInit` and asserts the appearance itself.
			if (
				opts.component === 'consent-widget' &&
				(opts.initMode ?? 'authoritative') === 'authoritative'
			) {
				await vi.waitFor(() =>
					expect(
						container.querySelector('[data-testid="consent-widget-root"]')
					).not.toBeNull()
				);
			}

			if (!mountedKernel) {
				throw new Error(`${framework} driver: mount completed without kernel`);
			}

			return {
				resolveInit: lifecycle.resolve
					? async () => {
							lifecycle.resolve?.();
							await flushScheduler();
						}
					: undefined,
				root: container,
				unmount: async () => {
					root.unmount();
					await flushScheduler();
					container.replaceChildren();
					container.remove();
					if (lastKernel === mountedKernel) {
						lastKernel = null;
					}
				},
			};
		},
		probePolicyContract,
		serverRender(opts: MountOptions): Promise<string> {
			const options = buildProviderOptions(opts);
			if (options.prefetch?.initialIab?.gvl) {
				Object.assign(
					options.prefetch.initialIab,
					deferInitGvl({ gvl: options.prefetch.initialIab.gvl }, '/test-gvl')
				);
			}
			return Promise.resolve(
				renderToString(
					renderTree(opts, options, () => {
						// Server render does not expose a live store to the conformance suite.
					})
				)
			);
		},
	};

	const api: SuiteApi = {
		describe,
		expect: expect as unknown as SuiteApi['expect'],
		test,
	};

	runConformanceSuite(driver, api);
};
