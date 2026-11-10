/**
 * Present the native consent prompt when one is owed, once per owed prompt.
 *
 * The provider calls {@link presentOwedPrompt} on mount, on every change to the
 * owed prompt, and on each return to the foreground. Everything that decides
 * whether to call native lives here, in one ledger per client, so React strict
 * mode, a remounted provider and a nested provider all see the same record of
 * what was already presented. The native host is the second guard: a call while
 * a session is open answers `already-presented` and opens nothing.
 */

import { isPromptOwed } from '../lib/selectors';
import { isProduction } from '../native/client';
import type { ConsentClient } from '../native/client';
import { presentConsentPrompt } from '../native/presenter';
import type { ConsentSnapshot } from '../protocol';
import { isPrivacyPolicyURL } from './privacy-policy-url';

/**
 * The code a native presenter rejects with when it refuses the privacy-policy URL.
 *
 * The only permanent refusal: the same URL fails the same way on every attempt. Every other
 * rejection, such as no foreground window or a core that is still installing, is transient.
 */
export const PRESENTER_INVALID_URL_CODE = 'C15T_PRESENTER_INVALID_URL';

/** What the provider remembers about one client's owed prompt. */
interface AutoPresentLedger {
	/** Key of the owed prompt already handed to native, `null` before any. */
	presented: string | null;
	/** A native call is in flight; a second trigger waits for it. */
	inFlight: boolean;
	/** A trigger arrived during the call, so the latest snapshot needs a pass after it. */
	recheck: boolean;
	/** Nothing was owed at some point during the call, which ends that prompt's episode. */
	endedInFlight: boolean;
	/** A privacy-policy URL native refused for good. It is not offered again. */
	refusedURL: string | null;
	/** The owed prompt a transient failure was last reported for, so each is reported once. */
	warned: string | null;
}

const ledgers = new WeakMap<ConsentClient, AutoPresentLedger>();

const ledgerFor = function ledgerFor(client: ConsentClient): AutoPresentLedger {
	let ledger = ledgers.get(client);
	if (ledger === undefined) {
		ledger = {
			endedInFlight: false,
			inFlight: false,
			presented: null,
			recheck: false,
			refusedURL: null,
			warned: null,
		};
		ledgers.set(client, ledger);
	}
	return ledger;
};

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

/**
 * Record a failed native call: retry a transient one, stop on a refused URL.
 *
 * @param ledger - The client's ledger.
 * @param key - The owed prompt the call was for.
 * @param privacyPolicyURL - The URL the call passed.
 * @param error - What native rejected with.
 */
const reportFailure = function reportFailure(
	ledger: AutoPresentLedger,
	key: string,
	privacyPolicyURL: string,
	error: unknown
): void {
	const code =
		typeof error === 'object' && error !== null && 'code' in error
			? String(error.code)
			: undefined;
	if (code === PRESENTER_INVALID_URL_CODE) {
		// Keep the key: the same URL would fail the same way on every trigger.
		ledger.refusedURL = privacyPolicyURL;
		// oxlint-disable-next-line no-console -- An owed consent prompt that can never show must be visible in every build.
		console.error(
			`c15t ConsentProvider: the native presenter refused privacyPolicyURL ${JSON.stringify(privacyPolicyURL)}, so the owed consent prompt cannot show. Pass an absolute HTTPS URL with a DNS host.`,
			error
		);
		return;
	}
	// No foreground window yet, or a core still installing. The next snapshot
	// change or return to the foreground tries again.
	ledger.presented = null;
	if (ledger.warned !== key && !isProduction()) {
		ledger.warned = key;
		console.warn(
			'c15t ConsentProvider: the native presenter could not open the owed consent prompt yet. It retries when the consent state changes or the app returns to the foreground.',
			error
		);
	}
};

/**
 * Hand an owed prompt to native unless this client already did.
 *
 * A transient failure, or a native answer that nothing is owed, forgets the key,
 * so the next trigger tries again; outside production the first failure for each
 * owed prompt is logged. A refused privacy-policy URL is permanent: it is logged
 * with `console.error` and not offered to native again, because the owed prompt
 * cannot show until the app passes a URL native accepts. A prompt the subject
 * dismissed keeps its key and stays closed until the requirement changes.
 *
 * A trigger that arrives while a call is in flight is not dropped. It marks the
 * ledger, and once the call settles the latest snapshot gets another pass. A
 * moment with nothing owed during the call ends the episode, so the same prompt
 * owed again afterwards presents again.
 *
 * @param client - The client whose snapshot decides.
 * @param privacyPolicyURL - The app's HTTPS privacy-policy URL.
 * @returns Once native answered, or at once when there is nothing to do.
 */
export const presentOwedPrompt = async function presentOwedPrompt(
	client: ConsentClient,
	privacyPolicyURL: string
): Promise<void> {
	const ledger = ledgerFor(client);
	const key = selectOwedPromptKey(client.getSnapshot());
	if (ledger.inFlight) {
		ledger.recheck = true;
		if (key === null) {
			ledger.endedInFlight = true;
		}
		return;
	}
	if (key === null) {
		ledger.presented = null;
		return;
	}
	if (ledger.presented === key || ledger.refusedURL === privacyPolicyURL) {
		return;
	}
	ledger.presented = key;
	ledger.inFlight = true;
	try {
		const session = await presentConsentPrompt(privacyPolicyURL);
		if (session.status === 'not-required') {
			ledger.presented = null;
		}
	} catch (error: unknown) {
		reportFailure(ledger, key, privacyPolicyURL, error);
	} finally {
		ledger.inFlight = false;
	}
	if (ledger.endedInFlight) {
		ledger.endedInFlight = false;
		ledger.presented = null;
	}
	if (ledger.recheck) {
		ledger.recheck = false;
		await presentOwedPrompt(client, privacyPolicyURL);
	}
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
