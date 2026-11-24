import { MINIMAL_GVL } from '@inth/conformance';
import type {
	CreatePolicySession,
	PolicyDomEvidence,
	PolicyEvidence,
	PolicyLogs,
	PolicyStorageBytes,
	PolicySsrEvidence,
	ProbePolicyContract,
} from '@inth/conformance/contract/policy-driver';
import type { ScenarioPolicy } from '@inth/conformance/contract/policy-scenarios';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentDialogTrigger,
	ConsentGate,
} from '@inth/react';
import { KernelContext } from '@inth/react/context';
import type {
	ConsentKernel,
	KernelConfig,
	ConsentPresentation,
	InitResponse,
} from '@inth/sdk/engine';
import { createConsentKernel, evaluateConsent } from '@inth/sdk/engine';
import { createNetworkBlocker } from '@inth/sdk/modules/network-blocker';
import {
	createPersistence,
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
	resolveStorageKeys,
} from '@inth/sdk/modules/persistence';
import type { PersistenceHandle } from '@inth/sdk/modules/persistence';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import type {
	GlobalVendorList,
	PolicyResolution,
} from '@inth/sdk/schema/types';
import {
	inspectPolicyRules,
	canonicalizePolicySet,
	createPresentationFingerprint,
	choicePromptFingerprintInput,
	noticePromptFingerprintInput,
	normalizePolicyRule,
	createPolicyRuleFingerprints,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { useContext, useEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { validateStoredConsentEnvelope } from '../../../core/src/modules/persistence/record-codec.model';
import { encodeStoredConsentEnvelopeJson } from '../../../core/src/modules/persistence/writer/record-encode.model';
import { gpcFromHeaders } from '../../../core/src/transports/decision-inputs.model';
import { createIAB } from '../../../iab/src/index';
import type { IABHandle } from '../../../iab/src/index';
import { gtag } from '../../../integrations/src/vendors/analytics/google-tag';
import { consentMarkup } from './consent-markup';
import { transportMode } from './fixtures/transport-mode';
import type { FrameworkRoot } from './framework-root';
import { bannerLoaded, writesLanded } from './policy-driver-waits';

// oxlint-disable-next-line promise/avoid-new -- Browser effects must settle between scenario operations.
const settle = () =>
	// oxlint-disable-next-line promise/avoid-new -- Browser effects must settle between scenario operations.
	new Promise<void>((resolve) => {
		setTimeout(resolve, 25);
	});
const firstLayer = (
	visible: boolean,
	notice: boolean
): PolicyDomEvidence['firstLayer'] => {
	if (!visible) {
		return 'hidden';
	}
	return notice ? 'notice' : 'choice';
};
const POLICY_GVL = {
	...MINIMAL_GVL,
	vendors: { 755: { ...MINIMAL_GVL.vendors[755], id: 755 } },
};
const config = { storageKey: 'inth-policy-conformance' };
const keys = resolveStorageKeys(config);
const legacyKey = keys.legacy[0]?.consent;
if (!legacyKey) {
	throw new Error('Conformance storage requires a legacy key');
}
const cookieValue = (key: string) => {
	const entry = document.cookie
		.split('; ')
		.find((part) => part.startsWith(`${key}=`));
	return entry ? decodeURIComponent(entry.slice(key.length + 1)) : null;
};
const storageBytes = (): PolicyStorageBytes => ({
	choice: {
		cookie: cookieValue(keys.consent),
		localStorage: localStorage.getItem(keys.consent),
	},
	legacyLocalStorage: localStorage.getItem(legacyKey),
	notice: {
		cookie: cookieValue(`${keys.consent}-notice`),
		localStorage: localStorage.getItem(`${keys.consent}-notice`),
	},
});
const prepare = (input: ScenarioPolicy): PolicyResolution => {
	const policy = normalizePolicyRule({
		categories: [...input.scope],
		id: 'conformance',
		match: { fallback: true },
		model: input.model,
		privacySignals: { gpc: { denyCategories: [...input.gpcDenyCategories] } },
		prompt: input.prompt,
		rights: [...input.rights],
		scopeMode: input.scopeMode,
		validity: {
			choiceDays: input.choice.maxAgeMs / 86_400_000,
			noticeDays: input.notice.maxAgeMs / 86_400_000,
		},
	});
	return {
		fingerprints: {
			...createPolicyRuleFingerprints(policy),
			choice: input.choice.fingerprint,
			legacyMaterial: input.legacyMaterialFingerprint,
			notice: input.notice.fingerprint,
		},
		matchedBy: 'fallback',
		policy,
		policyId: policy.id,
		status: 'matched',
	};
};
const isVisible = (element: Element | null): boolean => {
	if (!element || element.getClientRects().length === 0) {
		return false;
	}
	for (let node: Element | null = element; node; node = node.parentElement) {
		const style = getComputedStyle(node);
		if (
			node.hasAttribute('hidden') ||
			style.display === 'none' ||
			style.visibility === 'hidden' ||
			style.visibility === 'collapse' ||
			style.opacity === '0'
		) {
			return false;
		}
	}
	return true;
};
const bannerShown = () =>
	isVisible(document.querySelector('[data-testid="consent-banner-root"]'));
const getDom = (kernel: ConsentKernel): PolicyDomEvidence => {
	const root = document.querySelector('[data-testid="consent-banner-root"]');
	const actions: PolicyDomEvidence['actions'][number][] = [];
	for (const action of [
		'accept',
		'reject',
		'customize',
		'dismiss-notice',
	] as const) {
		const suffix = action === 'dismiss-notice' ? 'dismiss' : action;
		const control = root?.querySelector<HTMLButtonElement>(
			`[data-testid="consent-banner-${suffix}-button"]`
		);
		if (control) {
			const style = getComputedStyle(control);
			actions.push({
				action,
				group:
					control.parentElement?.getAttribute('data-testid') ??
					control.parentElement?.tagName ??
					'',
				interactionDepth: 1,
				prominence: `${style.backgroundColor}|${style.color}|${style.fontWeight}|${control.dataset.variant}|${control.dataset.mode}`,
				visible: isVisible(control),
			});
		}
	}
	const preferences =
		document.querySelector('[data-testid="consent-dialog-trigger"]') ||
		document.querySelector('[data-testid="consent-dialog-link"]');
	return {
		actions,
		firstLayer: firstLayer(
			isVisible(root),
			kernel.getSnapshot().promptRequirement.kind === 'notice'
		),
		preferencesOpen: !!document.querySelector(
			'[data-testid="consent-dialog-root"]'
		),
		rights: (preferences?.getAttribute('data-inth-rights')?.split(' ') ??
			[]) as PolicyDomEvidence['rights'],
	};
};

/** Shares policy exercises while each adapter supplies its real root component and server reader. */
export const createFrameworkPolicyDriver = ({
	Root: InthProvider,
	readInitialConfig,
}: {
	Root: FrameworkRoot;
	readInitialConfig: (input: {
		cookie: string;
		cookieName: string;
		now: number;
	}) => Promise<KernelConfig>;
}) => {
	const createPolicySession: CreatePolicySession = async (setup) => {
		// Compare action styling without a pointer left over a previous
		// control: a parked pointer gives that button its :hover tint.
		await userEvent.hover(document.documentElement, {
			position: { x: 1, y: 1 },
		});
		let resolution = prepare(setup.policy);
		let response: InitResponse = {
			cmpId: setup.policy.model === 'iab' ? 123 : undefined,
			gvl:
				setup.policy.model === 'iab'
					? (POLICY_GVL as unknown as GlobalVendorList)
					: null,
			policyResolution: writePolicyResolutionWire(resolution),
			policySnapshotToken: 'conformance-token',
		};
		let failTransport = false;
		let presentation: ConsentPresentation | undefined;
		let kernel: ConsentKernel;
		/**
		 * The provider publishes the kernel from an effect after render or
		 * hydration; under load that effect can land after the first settle, so
		 * every mount path waits for it before touching the kernel.
		 */
		const waitForKernel = () =>
			vi.waitFor(
				() => {
					if (!kernel) {
						throw new Error('Provider kernel is not ready after hydration');
					}
					return kernel;
				},
				{ interval: 50, timeout: 5000 }
			);
		let addon: IABHandle | undefined;
		let iabTargetAllowed: boolean | undefined;
		let persistence: PersistenceHandle;
		let root: Root | undefined;
		let container: HTMLDivElement | undefined;
		let ssr: PolicySsrEvidence | undefined;
		let serverConfig: KernelConfig | undefined;
		let scriptLoads = 0;
		let networkAttempts = 0;
		let networkCompletions = 0;
		const events: { name: string; payload: unknown }[] = [];
		const callbacks: { name: string; payload: unknown }[] = [];
		const requests: {
			kind: 'consent' | 'init';
			payload: unknown;
		}[] = [];
		const diagnostics: string[] = [];
		const logs = (): PolicyLogs => ({
			callbacks: [...callbacks],
			diagnostics: [...diagnostics],
			events: [...events],
			requests: [...requests],
		});
		const previousGpc = Object.getOwnPropertyDescriptor(
			navigator,
			'globalPrivacyControl'
		);
		Object.defineProperty(navigator, 'globalPrivacyControl', {
			configurable: true,
			value: setup.gpc,
		});
		const date = vi.spyOn(Date, 'now').mockImplementation(setup.clock.now);
		const warn = vi
			.spyOn(console, 'warn')
			.mockImplementation((...args) =>
				diagnostics.push(args.map(String).join(' '))
			);
		for (const key of [
			keys.consent,
			legacyKey,
			`${keys.consent}-notice`,
			keys.optOut,
			// A clear's epoch outlives it and would void the next seed's records.
			keys.epoch,
			// A clear keeps the subject ID; the next scenario is a new visitor.
			`${config.storageKey}-sid`,
		]) {
			localStorage.removeItem(key);
			document.cookie = `${key}=; Max-Age=0; Path=/`;
		}
		const seedBytes = (seed: NonNullable<typeof setup.storage.cookie>) => {
			if (seed.encoding !== 'v3-choice-json') {
				return seed.raw;
			}
			try {
				const result = validateStoredConsentEnvelope(
					JSON.parse(seed.raw),
					setup.clock.now()
				);
				return result.ok
					? encodeStoredConsentEnvelopeJson(result.record)
					: seed.raw;
			} catch {
				return seed.raw;
			}
		};
		if (setup.storage.cookie) {
			document.cookie = `${keys.consent}=${encodeURIComponent(seedBytes(setup.storage.cookie))}; Path=/`;
		}
		if (setup.storage.localStorage) {
			localStorage.setItem(keys.consent, seedBytes(setup.storage.localStorage));
		}
		if (setup.storage.legacyLocalStorage) {
			localStorage.setItem(
				legacyKey,
				seedBytes(setup.storage.legacyLocalStorage)
			);
		}
		localStorage.removeItem('inth-iab-authority-v1');
		const baseline = { logs: logs(), storage: storageBytes() };
		const consentMode: Record<string, string> = {};
		const previousGtag = window.gtag;
		window.gtag = (...args: unknown[]) => {
			if (
				args[0] === 'consent' &&
				typeof args[2] === 'object' &&
				args[2] !== null
			) {
				Object.assign(consentMode, args[2]);
			}
		};
		const originalFetch = window.fetch;
		window.fetch = (input, init) => {
			if (String(input).includes('inth-policy-probe.invalid')) {
				networkCompletions += 1;
				return Promise.resolve(new Response('probe'));
			}
			return originalFetch(input, init);
		};
		const Mount = () => {
			const current = useContext(KernelContext);
			useEffect(() => {
				if (!current) {
					throw new Error('Missing provider kernel');
				}
				kernel = current;
				const off = [
					'choice:recorded',
					'permissions:changed',
					'notice:dismissed',
				].map((name) =>
					current.events.on(name as 'choice:recorded', (payload) => {
						const { type: _type, ...eventPayload } = payload;
						events.push({ name, payload: eventPayload });
					})
				);
				persistence = createPersistence({
					kernel: current,
					now: setup.clock.now,
					storageConfig: config,
				});
				const scripts = setup.probeGates
					? createScriptLoader({
							kernel: current,
							scripts: [
								{
									attributes: { 'data-policy-script': 'true' },
									category: 'marketing',
									id: 'inth-policy-script',
									textContent:
										'window.dispatchEvent(new Event("inth-policy-script-loaded"))',
								},
								gtag({
									category: 'marketing',
									id: 'G-PROBE',
									script: { callbackOnly: true },
								}),
							],
						})
					: undefined;
				const blocker = setup.probeGates
					? createNetworkBlocker({
							kernel: current,
							logBlockedRequests: false,
							rules: [
								{ category: 'marketing', domain: 'inth-policy-probe.invalid' },
							],
						})
					: undefined;
				return () => {
					for (const dispose of off) {
						dispose();
					}
					scripts?.dispose();
					blocker?.dispose();
					persistence.dispose();
				};
			}, [current]);
			const snapshot = current?.getServerSnapshot();
			return (
				<script
					data-testid="policy-server-evidence"
					type="application/json"
				>
					{JSON.stringify({
						now: snapshot?.evaluatedAt,
						prompt: snapshot?.promptRequirement,
					})}
				</script>
			);
		};
		const countScript = () => {
			scriptLoads += 1;
		};
		window.addEventListener('inth-policy-script-loaded', countScript);
		const tree = (server = false) => {
			const initialRecords = server
				? serverConfig?.initialRecords
				: readStoredRecords(config, setup.clock.now()).records;
			return (
				<InthProvider
					persistence={false}
					state={{
						initialIab:
							setup.policy.model === 'iab'
								? {
										cmpId: 123,
										enabled: true,
										gvl: POLICY_GVL as unknown as GlobalVendorList,
									}
								: undefined,
						initialPolicyResolution: resolution,
						initialPrivacySignals: { gpc: setup.gpc },
						initialRecords,
						now: setup.clock.now(),
					}}
					options={{
						callbacks: {
							onChoiceRecorded: (payload) =>
								callbacks.push({ name: 'onChoiceRecorded', payload }),
							onPermissionsChanged: (payload) =>
								callbacks.push({ name: 'onPermissionsChanged', payload }),
						},
						// Shared scenarios review the full scope; gate probes only use marketing.
						consentCategories: [
							'necessary',
							'functionality',
							'measurement',
							'experience',
							'marketing',
						],
						disableAnimation: true,
						mode: transportMode({
							init: () => {
								requests.push({ kind: 'init', payload: null });
								return failTransport
									? Promise.reject(new Error('transport failed'))
									: Promise.resolve(response);
							},
							save: (payload) => {
								requests.push({ kind: 'consent', payload });
								return Promise.resolve({
									ok: true,
									subjectId: payload.subjectId ?? 'conformance-subject',
								});
							},
						}),

						presentation,
						// A real reload restarts the browser test page.
						reloadOnConsentRevoked: false,
					}}
				>
					<Mount />
					<ConsentBanner />
					<ConsentDialog models={['opt-in', 'opt-out', 'iab', 'none']} />
					<ConsentDialogTrigger />
					<ConsentDialogLink>Privacy settings</ConsentDialogLink>
					{setup.probeGates ? (
						<ConsentGate
							category="marketing"
							placeholder={
								<div data-testid="policy-iframe-placeholder">Blocked frame</div>
							}
						>
							<iframe
								sandbox=""
								title="probe"
								src="about:blank#inth-policy-probe"
								data-testid="policy-iframe"
							/>
						</ConsentGate>
					) : null}
				</InthProvider>
			);
		};
		const mount = async (hydrate = false) => {
			container = document.createElement('div');
			document.body.append(container);
			if (hydrate) {
				const { cookie } = document;
				serverConfig = await readInitialConfig({
					cookie,
					cookieName: config.storageKey,
					now: setup.clock.now(),
				});
				const app = tree(true);
				container.innerHTML = renderToString(app);
				const serializedEvidence = container.querySelector(
					'[data-testid="policy-server-evidence"]'
				)?.textContent;
				if (!serializedEvidence) {
					throw new Error('Server render did not expose its actual snapshot');
				}
				const serverSnapshot = JSON.parse(serializedEvidence) as Pick<
					PolicySsrEvidence['server'],
					'now' | 'prompt'
				>;
				const serverDom = consentMarkup(container);
				const serverLayer = firstLayer(
					isVisible(
						container.querySelector('[data-testid="consent-banner-root"]')
					),
					serverSnapshot.prompt.kind === 'notice'
				);
				const firstLayerHistory: PolicyDomEvidence['firstLayer'][] = [
					serverLayer,
				];
				const observer = new MutationObserver(() => {
					if (kernel) {
						firstLayerHistory.push(getDom(kernel).firstLayer);
					}
				});
				observer.observe(document.body, {
					attributes: true,
					childList: true,
					subtree: true,
				});
				const errors: string[] = [];
				const consoleErrors = vi
					.spyOn(console, 'error')
					.mockImplementation((...args) =>
						errors.push(args.map(String).join(' '))
					);
				root = hydrateRoot(container, app, {
					onRecoverableError: (error) => errors.push(String(error)),
				});
				await settle();
				await waitForKernel();
				observer.disconnect();
				consoleErrors.mockRestore();
				const dom = getDom(kernel);
				ssr = {
					client: {
						dom: consentMarkup(container),
						firstLayer: dom.firstLayer,
						now: setup.clock.now(),
						prompt: kernel.getSnapshot().promptRequirement,
					},
					firstLayerHistory: [...firstLayerHistory, dom.firstLayer],
					hydrationWarnings: errors,
					server: {
						dom: serverDom,
						firstLayer: serverLayer,
						now: serverConfig.now ?? setup.clock.now(),
						prompt: serverSnapshot.prompt,
					},
				};
			} else {
				root = createRoot(container);
				root.render(tree());
				await settle();
				await waitForKernel();
				await kernel.commands.init();
				await settle();
			}
		};
		const click = async (testId: string) => {
			const button = await vi.waitFor(
				() => {
					const control = document.querySelector<HTMLButtonElement>(
						`[data-testid="${testId}"]`
					);
					if (!control) {
						throw new Error(`Required rendered control missing: ${testId}`);
					}
					return control;
				},
				// Browser conformance runs share a machine with every other suite;
				// controls can take more than the default second to appear.
				{ interval: 50, timeout: 5000 }
			);
			button.click();
			await settle();
		};
		const openPreferencesFromTrigger = async () => {
			await click('consent-dialog-trigger');
			if (kernel.getSnapshot().activeUI !== 'dialog') {
				await click('opt-out-confirmation-preferences-link');
			}
		};
		// Save stays disabled until a switch changes (EU-03), and the notice
		// regime has no Save: its rows and switches record as they change, and
		// Done closes without recording anything (LAW-04). The visitor's control
		// is an enabled Save, or else the Done or Close the scenario names, and
		// the scenario asserts what pressing it did. With no prompt owed, the
		// dialog has only Close: it answers nothing, as the kernel contract
		// says.
		const saveCurrentInDialog = async (close: 'done' | 'close') => {
			await vi.waitFor(
				() => {
					if (!document.querySelector('[data-testid="consent-dialog-root"]')) {
						throw new Error(
							'Required rendered control missing: consent-dialog-root'
						);
					}
				},
				{ interval: 50, timeout: 5000 }
			);
			const save = document.querySelector<HTMLButtonElement>(
				'[data-testid="consent-dialog-save-button"]'
			);
			if (save && !save.disabled) {
				save.click();
			} else {
				const testId =
					close === 'done' ? 'consent-dialog-done' : 'consent-dialog-close';
				const control = document.querySelector<HTMLButtonElement>(
					`[data-testid="${testId}"]:not(:disabled)`
				);
				if (!control) {
					throw new Error(
						`Required rendered control missing: an enabled Save or ${testId}`
					);
				}
				control.click();
			}
			await settle();
		};
		// The dialog offers the one-click pair under a choice model and the
		// rights rows under a notice model, where allowing asks to confirm.
		const chooseInDialog = async (choice: 'accept' | 'reject') => {
			const oneClick =
				choice === 'accept'
					? 'consent-dialog-accept-all'
					: 'consent-dialog-reject-all';
			const row =
				choice === 'accept'
					? 'consent-dialog-right-option-sale-allow'
					: 'consent-dialog-right-option-sale-protect';
			const control = await vi.waitFor(
				() => {
					const found = document.querySelector<HTMLElement>(
						`[data-testid="${oneClick}"], [data-testid="${row}"]`
					);
					if (!found) {
						throw new Error(`Required rendered control missing: ${oneClick}`);
					}
					return found;
				},
				{ interval: 50, timeout: 5000 }
			);
			control.click();
			await settle();
			if (
				document.querySelector('[data-testid="consent-dialog-confirm-allow"]')
			) {
				await click('consent-dialog-confirm-allow');
			}
		};

		return {
			baseline,
			async dispose() {
				try {
					// A write still waiting would land in the next scenario.
					await writesLanded();
				} finally {
					addon?.dispose();
					root?.unmount();
					container?.remove();
					date.mockRestore();
					warn.mockRestore();
					window.fetch = originalFetch;
					window.gtag = previousGtag;
					window.removeEventListener('inth-policy-script-loaded', countScript);
					if (previousGpc) {
						Object.defineProperty(
							navigator,
							'globalPrivacyControl',
							previousGpc
						);
					} else {
						Reflect.deleteProperty(navigator, 'globalPrivacyControl');
					}
				}
			},
			// oxlint-disable-next-line complexity -- Each branch executes one distinct shared scenario operation.
			async execute(operation) {
				if (!root) {
					await mount(operation.kind === 'ssr-hydrate');
				}
				switch (operation.kind) {
					case 'hydrate':
					case 'ssr-hydrate':
						break;
					case 'accept':
						if (
							document.querySelector(
								'[data-testid="consent-banner-accept-button"]'
							)
						) {
							await click('consent-banner-accept-button');
						} else {
							await openPreferencesFromTrigger();
							await chooseInDialog('accept');
						}
						break;
					case 'reject':
						if (
							document.querySelector(
								'[data-testid="consent-banner-reject-button"]'
							)
						) {
							await click('consent-banner-reject-button');
						} else {
							await openPreferencesFromTrigger();
							await chooseInDialog('reject');
						}
						break;
					case 'save-current':
						if (kernel.getSnapshot().activeUI !== 'dialog') {
							await openPreferencesFromTrigger();
						}
						await saveCurrentInDialog(operation.close);
						break;
					case 'dismiss-notice':
						await click('consent-banner-dismiss-button');
						break;
					case 'save':
						await kernel.commands.save(operation.values);
						break;
					case 'clear':
						persistence.clear();
						break;
					case 'set-gpc':
						kernel.set.privacySignals({ gpc: operation.active });
						break;
					case 'advance-time':
						kernel.refresh(operation.now);
						document.dispatchEvent(new Event('visibilitychange'));
						break;
					case 'apply-policy':
						resolution = operation.policy
							? prepare(operation.policy)
							: { policy: null, status: 'no-match' };
						response = {
							policyResolution: writePolicyResolutionWire(resolution),
						};
						await kernel.commands.init();
						break;
					case 'resolve-failure':
						failTransport = operation.reason === 'transport';
						response = {};
						await kernel.commands.init();
						break;
					case 'resolve-unconfigured':
						response = {
							policyResolution: {
								policy: null,
								status: 'unconfigured',
								version: 1,
							},
						};
						await kernel.commands.init();
						break;
					case 'unsupported-wire':
						response = {
							policyResolution: {
								policy: null,
								status: 'matched',
								version: 99,
							},
						};
						await kernel.commands.init();
						break;
					case 'presentation':
						presentation = {
							prompt: {
								direction: operation.layout,
								primaryActions: operation.primary
									? [operation.primary]
									: undefined,
							},
						};
						root?.render(tree());
						break;
					case 'open-preferences':
						if (operation.via === 'trigger') {
							await openPreferencesFromTrigger();
						} else {
							await click('consent-dialog-link');
						}
						// The framework boundary applies the surface change a tick after
						// the click, later than a fixed settle covers under load.
						await vi.waitFor(
							() => {
								if (
									!document.querySelector('[data-testid="consent-dialog-root"]')
								) {
									throw new Error('Preference center did not open');
								}
							},
							{ interval: 50, timeout: 5000 }
						);
						break;
					case 'reload':
						root?.unmount();
						container?.remove();
						root = undefined;
						await mount();
						break;
					case 'probe-iab': {
						if (
							operation.authority === 'valid' &&
							!kernel.getSnapshot().iab?.authority
						) {
							const seedKernel = createConsentKernel({
								initialIab:
									setup.policy.model === 'iab'
										? {
												cmpId: 123,
												enabled: true,
												gvl: POLICY_GVL as unknown as GlobalVendorList,
											}
										: undefined,
								initialPolicyResolution: resolution,
								now: setup.clock.now(),
							});
							const seedAddon = createIAB({
								cmpId: 123,
								gvl: POLICY_GVL as unknown as GlobalVendorList,
								kernel: seedKernel,
							});
							try {
								seedAddon.acceptAll();
								await seedAddon.save();
							} finally {
								seedAddon.dispose();
								seedKernel.dispose();
							}
							addon = createIAB({
								cmpId: 123,
								gvl: POLICY_GVL as unknown as GlobalVendorList,
								kernel,
							});
							await settle();
						}
						iabTargetAllowed = evaluateConsent(
							{
								category: operation.category,
								iabPurposes: [1],
								vendorId: 755,
							},
							kernel.getSnapshot(),
							setup.clock.now()
						);
						break;
					}

					default: {
						const exhaustive: never = operation;
						throw new Error(`Unknown operation ${String(exhaustive)}`);
					}
				}
				await settle();
				await writesLanded();
				await bannerLoaded(kernel, bannerShown);
				if (setup.probeGates) {
					networkAttempts += 1;
					await window.fetch('https://inth-policy-probe.invalid/collect');
				}
			},
			observe(): PolicyEvidence {
				const snapshot = kernel.getSnapshot();
				return {
					dom: getDom(kernel),
					gates: setup.probeGates
						? {
								consentMode: { ...consentMode },
								iframePlaceholderVisible: !!document.querySelector(
									'[data-testid="policy-iframe-placeholder"]'
								),
								iframeSrc:
									document
										.querySelector('[data-testid="policy-iframe"]')
										?.getAttribute('src') ?? null,
								networkAttempts,
								networkCompletions,
								scriptAttached: !!document.querySelector(
									'script[data-policy-script]'
								),
								scriptLoads,
							}
						: undefined,
					iabTargetAllowed,
					logs: logs(),
					snapshot: { ...snapshot, iab: snapshot.iab ?? null },
					ssr,
					storage: storageBytes(),
				};
			},
		};
	};

	/** Probe canonical schema and storage implementations, independently of lifecycle scenarios. */
	const probePolicyContract: ProbePolicyContract = async (input) => {
		const base = {
			categories: ['marketing', 'measurement'],
			id: 'probe',
			match: { fallback: true },
			model: 'opt-out' as const,
			prompt: 'choice' as const,
			scopeMode: 'strict' as const,
		};
		switch (input.kind) {
			case 'validate':
				return {
					valid:
						inspectPolicyRules([
							{
								...base,
								model: input.model,
								privacySignals: {
									gpc: { denyCategories: input.gpcDenyCategories ?? [] },
								},
								prompt: input.prompt,
							},
						]).errors.length === 0,
				};
			case 'canonicalize':
				return { canonical: canonicalizePolicySet([...input.values]) };
			case 'decode': {
				const records = readStoredRecordsFromCookieHeader(
					`${keys.consent}=${encodeURIComponent(input.record.raw)}`,
					config,
					input.now
				);
				return {
					decoded: records.choice
						? { choice: records.choice, subject: records.subject ?? null }
						: null,
				};
			}
			case 'detect-gpc': {
				if (input.source === 'header') {
					return {
						detected:
							gpcFromHeaders({
								'sec-gpc': typeof input.value === 'string' ? input.value : '',
							}) ?? false,
					};
				}
				const before = Object.getOwnPropertyDescriptor(
					navigator,
					'globalPrivacyControl'
				);
				Object.defineProperty(navigator, 'globalPrivacyControl', {
					configurable: true,
					value: input.value,
				});
				const kernel = createConsentKernel();
				await kernel.commands.init();
				const { detected } = kernel.getSnapshot().privacySignals.gpc;
				kernel.dispose();
				if (before) {
					Object.defineProperty(navigator, 'globalPrivacyControl', before);
				} else {
					Reflect.deleteProperty(navigator, 'globalPrivacyControl');
				}
				return { detected };
			}
			case 'fingerprints': {
				const { mutation } = input;
				const policy = normalizePolicyRule({
					...base,
					categories: Array.isArray(mutation.scopeOrder)
						? mutation.scopeOrder
						: base.categories,
					copyRevision:
						typeof mutation.copyRevision === 'string'
							? mutation.copyRevision
							: undefined,
					privacySignals: {
						gpc: {
							denyCategories: Array.isArray(mutation.gpcDenyCategories)
								? mutation.gpcDenyCategories
								: [],
						},
					},
					validity: mutation.validity,
				});
				const visual = {
					actionOrder: Array.isArray(mutation.actionOrder)
						? mutation.actionOrder.filter(
								(action): action is string => typeof action === 'string'
							)
						: ['accept', 'reject'],
					layout: typeof mutation.layout === 'string' ? mutation.layout : 'row',
				};
				return {
					fingerprintInputs: {
						choice: choicePromptFingerprintInput(policy),
						notice: noticePromptFingerprintInput(policy),
					},
					fingerprints: {
						...createPolicyRuleFingerprints(policy),
						presentation: createPresentationFingerprint(visual),
					},
				};
			}
			default: {
				const exhaustive: never = input;
				throw new Error(`Unknown producer ${String(exhaustive)}`);
			}
		}
	};

	return { createPolicySession, probePolicyContract };
};
