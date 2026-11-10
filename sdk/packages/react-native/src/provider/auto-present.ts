/**
 * Present the native consent prompt when one is owed, once per owed prompt.
 *
 * The provider calls {@link presentOwedPrompt} on mount, on every change to the
 * owed prompt, and on each return to the foreground. The decisions are the state
 * machine in `auto-present-machine.ts`; this file runs its effects. There is one
 * ledger per client, so React strict mode, a remounted provider and a nested
 * provider all see the same record. The native host is the second guard: a call
 * while a session is open answers `already-presented`, names what that session
 * shows, and opens nothing.
 */

import { isPromptOwed } from '../lib/selectors';
import { isProduction } from '../native/client';
import type { ConsentClient } from '../native/client';
import {
	onConsentPresenterOutcome,
	presentConsentPrompt,
} from '../native/presenter';
import type { ConsentSnapshot } from '../protocol';
import {
	INITIAL_AUTO_PRESENT_FACTS,
	stepAutoPresent,
} from './auto-present-machine';
import type {
	AutoPresentContext,
	AutoPresentFacts,
	AutoPresentInput,
} from './auto-present-machine';
import { isPrivacyPolicyURL } from './privacy-policy-url';

/**
 * The code a native presenter rejects with when it refuses the privacy-policy URL.
 *
 * The only permanent refusal: the same URL fails the same way on every attempt. Every other
 * rejection, such as no foreground window or a core that is still installing, is transient.
 */
export const PRESENTER_INVALID_URL_CODE = 'C15T_PRESENTER_INVALID_URL';

/**
 * Name the owed prompt a snapshot describes.
 *
 * Two snapshots owe the same prompt when the matched policy, the kind of prompt,
 * the reason and `promptOwedSince` all agree. A new policy or an expired choice
 * changes the key, which is what makes the prompt present again. So does the same
 * requirement owed again after nothing was owed: native moves `promptOwedSince`
 * for it, so the key changes even when the bridge delivered only the latest
 * snapshot and the moment with nothing owed never reached JavaScript. A binary
 * that predates `promptOwedSince` reports `null`, and the ledger falls back to the
 * transitions it observes. The native presenters key their own suppression the
 * same way.
 *
 * @param snapshot - The snapshot to read.
 * @returns The key, or `null` while the core is not ready or nothing is owed.
 */
export const selectOwedPromptKey = function selectOwedPromptKey(
	snapshot: ConsentSnapshot
): string | null {
	if (!isPromptOwed(snapshot)) {
		return null;
	}
	const requirement = snapshot.promptRequirement;
	const reason = requirement.kind === 'none' ? '' : requirement.reason;
	const since = snapshot.promptOwedSince ?? '';
	return `${snapshot.resolution.fingerprint ?? ''}:${requirement.kind}:${reason}:${since}`;
};

const errorCode = function errorCode(error: unknown): string | undefined {
	return typeof error === 'object' && error !== null && 'code' in error
		? String(error.code)
		: undefined;
};

/** One client's ledger: the stored facts, and the side effects each input asks for. */
class AutoPresentLedger {
	facts: AutoPresentFacts = INITIAL_AUTO_PRESENT_FACTS;
	/** Providers currently presenting through this client. */
	active = 0;
	/** The URL the provider passes now. */
	url: string;
	/** The owed prompt a transient failure was last reported for, so each is reported once. */
	warned: string | null = null;
	/** Counts triggers, for the context. */
	generation = 0;
	/** The latest native call, so a caller can wait for the chain to settle. */
	settled: Promise<void> = Promise.resolve();
	private readonly client: ConsentClient;

	constructor(client: ConsentClient, url: string) {
		this.client = client;
		this.url = url;
		// For the client's lifetime, so an outcome is not lost while no provider is
		// mounted or the app opted out; a session reported open is always heard closing.
		try {
			onConsentPresenterOutcome((outcome) => {
				this.dispatch({
					kind: outcome.kind,
					sessionId: outcome.sessionId,
					type: 'outcome',
				});
			});
		} catch {
			// No native event emitter: nothing can be presented either.
		}
	}

	/** The current inputs, read fresh for every input. */
	private context(): AutoPresentContext {
		return {
			active: this.active > 0,
			generation: this.generation,
			key: selectOwedPromptKey(this.client.getSnapshot()),
			url: this.url,
		};
	}

	/**
	 * Apply `input`, decide afresh, and run what that asks for.
	 *
	 * @param input - What happened.
	 * @param error - The rejection behind a `refused` or `failed` input, for the report.
	 */
	dispatch(input: AutoPresentInput, error?: unknown): void {
		if (input.type === 'trigger') {
			this.generation += 1;
		}
		const failedKey = this.facts.inFlight?.key ?? null;
		const { effects, facts } = stepAutoPresent(
			this.facts,
			input,
			this.context()
		);
		this.facts = facts;
		for (const effect of effects) {
			switch (effect) {
				case 'present':
					this.settled = this.callNative();
					break;
				case 'report-refused':
					// oxlint-disable-next-line no-console -- An owed consent prompt that can never show must be visible in every build.
					console.error(
						`c15t ConsentProvider: the native presenter refused privacyPolicyURL ${JSON.stringify(facts.refused)}, so the owed consent prompt cannot show. Pass an absolute HTTPS URL with a DNS host.`,
						error
					);
					break;
				default:
					this.warnUnavailable(failedKey, error);
			}
		}
	}

	private warnUnavailable(key: string | null, error: unknown): void {
		if (this.warned === key || isProduction()) {
			return;
		}
		this.warned = key;
		console.warn(
			'c15t ConsentProvider: the native presenter could not open the owed consent prompt yet. It retries when the consent state changes or the app returns to the foreground.',
			error
		);
	}

	private async callNative(): Promise<void> {
		const { url } = this;
		try {
			const session = await presentConsentPrompt(url);
			if (session.status === 'not-required' || session.sessionId === null) {
				this.dispatch({ type: 'not-required' });
			} else {
				this.dispatch({
					presentation: session.presentation,
					sessionId: session.sessionId,
					type: session.status === 'presented' ? 'shown' : 'already-presented',
				});
			}
		} catch (error: unknown) {
			this.dispatch(
				{
					type:
						errorCode(error) === PRESENTER_INVALID_URL_CODE
							? 'refused'
							: 'failed',
				},
				error
			);
		}
	}
}

const ledgers = new WeakMap<ConsentClient, AutoPresentLedger>();

const ledgerFor = function ledgerFor(
	client: ConsentClient,
	url: string
): AutoPresentLedger {
	let ledger = ledgers.get(client);
	if (ledger === undefined) {
		ledger = new AutoPresentLedger(client, url);
		ledgers.set(client, ledger);
	}
	return ledger;
};

/**
 * Decide, with the current snapshot, whether to hand an owed prompt to native.
 *
 * The provider calls it on mount, on every change to the owed prompt, and on
 * each return to the foreground. The decision is {@link stepAutoPresent}'s. A
 * refused privacy-policy URL is reported with `console.error` and not offered
 * again; outside production the first transient failure for each owed prompt is
 * logged and the next trigger retries.
 *
 * @param client - The client whose snapshot decides.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Once the native call this trigger started, if any, has settled.
 */
export const presentOwedPrompt = function presentOwedPrompt(
	client: ConsentClient,
	privacyPolicyURL: string
): Promise<void> {
	const ledger = ledgerFor(client, privacyPolicyURL);
	ledger.url = privacyPolicyURL;
	ledger.dispatch({ type: 'trigger' });
	return ledger.settled;
};

/**
 * Count a provider that presents through `client`, for as long as it is mounted.
 *
 * Rechecks after a call or a session closes run only while one is.
 *
 * @param client - The client.
 * @param privacyPolicyURL - The URL that provider passes.
 * @returns Stop counting it.
 */
export const attachAutoPresent = function attachAutoPresent(
	client: ConsentClient,
	privacyPolicyURL: string
): () => void {
	const ledger = ledgerFor(client, privacyPolicyURL);
	ledger.active += 1;
	return () => {
		ledger.active -= 1;
	};
};

/**
 * Refuse a privacy-policy URL the native host would reject, at render time.
 *
 * @param privacyPolicyURL - The value the app passed.
 * @throws {TypeError} When it is missing or is a URL a native presenter would
 *   refuse. See {@link isPrivacyPolicyURL} for the exact rules.
 */
export const assertPrivacyPolicyURL: (
	privacyPolicyURL: string | undefined
) => asserts privacyPolicyURL is string = function assertPrivacyPolicyURL(
	privacyPolicyURL
) {
	if (privacyPolicyURL === undefined || !isPrivacyPolicyURL(privacyPolicyURL)) {
		throw new TypeError(
			`<ConsentProvider> presents the consent prompt and needs an absolute HTTPS privacyPolicyURL with a DNS host, such as "https://example.com/privacy". Got ${JSON.stringify(privacyPolicyURL)}. Pass a valid URL, or autoPresent={false} to present the prompt yourself.`
		);
	}
};
