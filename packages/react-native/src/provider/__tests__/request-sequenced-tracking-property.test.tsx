/**
 * App Tracking Transparency over seeded random sequences, through the real
 * provider, ledger and sequence against a model of the native host.
 *
 * After every step, and at the moment Apple is asked, it checks: ATT is asked
 * at most once per launch (more only after Apple's EU sheet paused on
 * Additional Information, which Apple asks apps to follow with a second
 * request); never while an Inth screen is open; never while the provider says
 * `manual`; never after a stored choice refused marketing; with `afterConsent`,
 * only while marketing is granted; never while the app is not active; and
 * never in a build that did not enable ATT.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
	flushPromises,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import type { RenderHandle } from '../../__tests__/helpers/fake-native';
import {
	appState,
	emitNativeEvent,
	resetNativeStub,
	setAppState,
} from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import {
	presentConsentPrompt,
	presentPreferences,
} from '../../native/presenter';
import type { ConsentSnapshot } from '../../protocol';
import { InthProvider } from '../inth-provider';
import type { ConsentTrackingRequest } from '../tracking-sequence';

const URL = 'https://example.com/privacy';
const MODES: readonly ConsentTrackingRequest[] = [
	'afterConsent',
	'beforeConsent',
	'manual',
];

/** Park–Miller, as in the ledger's property test, so a failing seed reproduces. */
const seeded = (seed: number): (() => number) => {
	const modulus = 2_147_483_647;
	let value = (seed % (modulus - 1)) + 1;
	const advance = (): number => {
		value = (value * 48_271) % modulus;
		return value / modulus;
	};
	// A small seed's first outputs sit near zero, which would pin every seed's
	// first choices. Discard them.
	for (let warm = 0; warm < 4; warm += 1) {
		advance();
	}
	return advance;
};

/** What the model knows when Apple is asked. */
interface AskContext {
	readonly attEnabled: boolean;
	readonly eu: boolean;
	readonly asks: number;
	readonly open: boolean;
	readonly mode: ConsentTrackingRequest;
	readonly snapshot: ConsentSnapshot;
	readonly active: boolean;
}

/** The invariants, at the moment Apple is asked. */
const violations = function violations(context: AskContext): string[] {
	const { snapshot } = context;
	const found: string[] = [];
	if (!context.attEnabled) {
		found.push('asked without ATT enabled');
	}
	if (context.open) {
		found.push('asked while an Inth screen is open');
	}
	if (context.mode === 'manual') {
		found.push('asked in manual');
	}
	if (snapshot.explicitChoice?.categories.marketing?.value === false) {
		found.push('asked after marketing was refused');
	}
	if (
		context.mode === 'afterConsent' &&
		snapshot.effectivePermissions.marketing !== true
	) {
		found.push('asked after consent without marketing');
	}
	if (!context.active) {
		found.push('asked while the app is not active');
	}
	if (!context.eu && context.asks > 1) {
		found.push('asked twice in one launch');
	}
	return found;
};

const snapshotFor = (
	revision: number,
	owed: boolean,
	marketing: boolean,
	refused: boolean
): ConsentSnapshot =>
	({
		...buildSnapshot({
			effectivePermissions: {
				experience: false,
				functionality: true,
				marketing,
				measurement: false,
				necessary: true,
			},
			explicitChoice: refused
				? {
						categories: {
							marketing: {
								basis: { fingerprint: 'policy-a', kind: 'choice-v1' },
								confirmedAt: 1,
								value: false,
							},
						},
						version: 3,
					}
				: null,
			promptRequirement: owed
				? { kind: 'choice', reason: 'missing' }
				: { kind: 'none' },
			resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
			revision,
		}),
		promptOwedSince: owed ? revision : null,
	}) as ConsentSnapshot;

afterEach(() => {
	setAppState('active');
	resetConsentClient();
	resetNativeStub();
});

const ACTIONS = [
	'grant',
	'refuse',
	'dismiss',
	'owe',
	'app-prompt',
	'app-settings',
	'app-state',
	'mode',
	'auto',
	'remount',
	'hold',
	'answer',
	'mount-child',
] as const;
type Action = (typeof ACTIONS)[number];

/** A child that opens the prompt from its own mount effect, before the provider's run. */
const PresentsOnMount = (): ReactNode => {
	useEffect(() => {
		void presentConsentPrompt(URL);
	}, []);
	return null;
};

const runSeed = async function runSeed(seed: number): Promise<string[]> {
	const random = seeded(seed);
	const pick = <Item,>(items: readonly Item[]): Item =>
		items[Math.floor(random() * items.length)] as Item;
	const attEnabled = seed % 3 !== 0;
	const eu = seed % 4 === 0;
	let revision = 1;
	let snapshot = snapshotFor(revision, true, false, false);
	const fake = createFakeNativeModule({ snapshot });
	fake.setTrackingAuthorization(attEnabled ? 'not-determined' : 'unsupported');

	const failures: string[] = [];
	const trace: string[] = [];
	let mode = pick(MODES);
	let autoPresent = random() < 0.7;
	let open: { readonly id: string; readonly kind: string } | null = null;
	let sessions = 0;
	let asks = 0;
	let answers = 0;
	let authorization = attEnabled ? 'not-determined' : 'unsupported';
	let child = random() < 0.3;
	/** A provider is mounted. Once it has gone, the app's own call is not held. */
	let mounted = true;
	let hold = false;
	const held: (() => void)[] = [];

	const respond = (kind: 'prompt' | 'preferences'): Promise<string> => {
		if (open !== null) {
			return Promise.resolve(
				JSON.stringify({
					presentation: open.kind,
					sessionId: open.id,
					status: 'already-presented',
				})
			);
		}
		if (kind === 'prompt' && snapshot.promptRequirement.kind === 'none') {
			return Promise.resolve(
				JSON.stringify({ sessionId: null, status: 'not-required' })
			);
		}
		// beforeConsent: no prompt opens while Apple would be asked and has not answered.
		if (
			kind === 'prompt' &&
			mounted &&
			mode === 'beforeConsent' &&
			authorization === 'not-determined' &&
			answers === 0 &&
			snapshot.explicitChoice?.categories.marketing?.value !== false
		) {
			failures.push(
				`a beforeConsent prompt opened before Apple answered, seed ${String(seed)} after ${trace.join(' ')}`
			);
		}
		sessions += 1;
		open = { id: `s${String(sessions)}`, kind };
		return Promise.resolve(
			JSON.stringify({
				presentation: kind,
				sessionId: open.id,
				status: 'presented',
			})
		);
	};
	fake.presentConsentPrompt = (): Promise<string> => respond('prompt');
	fake.presentPreferences = (): Promise<string> => respond('preferences');

	const close = (kind: string): void => {
		if (open === null) {
			return;
		}
		const { id } = open;
		open = null;
		emitNativeEvent(
			'onConsentPresenterOutcome',
			JSON.stringify({ kind, revision, sessionId: id })
		);
	};
	fake.closeConsentPresenter = (sessionId: string): Promise<void> => {
		if (open?.id === sessionId) {
			queueMicrotask(() => {
				close('dismissed');
			});
		}
		return Promise.resolve();
	};

	fake.requestTrackingAuthorization = (): Promise<string> => {
		asks += 1;
		const where = `seed ${String(seed)} after ${trace.join(' ')}`;
		for (const violation of violations({
			active: appState.state === 'active',
			asks,
			attEnabled,
			eu,
			mode,
			open: open !== null,
			snapshot,
		})) {
			failures.push(`${violation}, ${where}`);
		}
		const stage = eu ? 'additional-information' : 'final';
		const answered = random() < 0.5 ? 'authorized' : 'denied';
		const status = eu ? 'not-determined' : answered;
		return new Promise((resolve) => {
			const answer = (): void => {
				answers += 1;
				authorization = status;
				fake.setTrackingAuthorization(status);
				resolve(JSON.stringify({ presentation: 'standard', stage, status }));
			};
			if (hold) {
				held.push(answer);
			} else {
				answer();
			}
		});
	};

	const element = () =>
		autoPresent ? (
			<InthProvider
				privacyPolicyUrl={URL}
				trackingRequest={mode}
			>
				{child ? <PresentsOnMount /> : null}
			</InthProvider>
		) : (
			<InthProvider
				autoPresent={false}
				trackingRequest={mode}
			>
				{child ? <PresentsOnMount /> : null}
			</InthProvider>
		);
	let tree: RenderHandle | null = renderTree(element());
	await flushPromises();

	const push = (owed: boolean, marketing: boolean, refused: boolean): void => {
		revision += 1;
		snapshot = snapshotFor(revision, owed, marketing, refused);
		fake.pushSnapshot(snapshot);
	};

	const act = (action: Action): void => {
		switch (action) {
			case 'grant':
				push(false, true, false);
				close('committed');
				break;
			case 'refuse':
				push(false, false, true);
				close('committed');
				break;
			case 'dismiss':
				close('dismissed');
				break;
			case 'owe':
				push(true, snapshot.effectivePermissions.marketing === true, false);
				break;
			case 'app-prompt':
				void presentConsentPrompt(URL);
				break;
			case 'app-settings':
				void presentPreferences(URL);
				break;
			case 'app-state':
				setAppState(appState.state === 'active' ? 'inactive' : 'active');
				break;
			case 'mode':
				mode = pick(MODES);
				trace.push(mode);
				tree?.rerender(element());
				break;
			case 'auto':
				autoPresent = !autoPresent;
				tree?.rerender(element());
				break;
			case 'remount':
				child = false;
				tree?.unmount();
				tree = renderTree(element());
				break;
			case 'mount-child':
				// A remount whose child presents in its own mount effect.
				child = true;
				tree?.unmount();
				tree = renderTree(element());
				break;
			case 'hold':
				hold = !hold;
				break;
			default:
				for (const answer of held.splice(0)) {
					answer();
				}
		}
	};

	for (let step = 0; step < 30; step += 1) {
		const action = pick(ACTIONS);
		trace.push(action);
		act(action);
		// The sequence's own waits run on microtasks and timers.
		// oxlint-disable-next-line no-await-in-loop -- each step must settle before the next.
		await flushPromises();
	}
	mounted = false;
	tree?.unmount();
	for (const answer of held.splice(0)) {
		answer();
	}
	await flushPromises();
	return failures;
};

describe('ATT over random sequences', () => {
	test('keeps every invariant for 150 seeds', async () => {
		for (let seed = 1; seed <= 150; seed += 1) {
			// oxlint-disable-next-line no-await-in-loop -- seeds share the module-level stubs.
			const failures = await runSeed(seed);
			expect(failures).toStrictEqual([]);
			resetConsentClient();
			resetNativeStub();
			setAppState('active');
		}
	}, 120_000);
});
