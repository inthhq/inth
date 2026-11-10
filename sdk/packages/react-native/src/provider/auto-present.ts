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
import type { ConsentClient } from '../native/client';
import { presentConsentPrompt } from '../native/presenter';
import type { ConsentSnapshot } from '../protocol';

/** What the provider remembers about one client's owed prompt. */
interface AutoPresentLedger {
	/** Key of the owed prompt already handed to native, `null` before any. */
	presented: string | null;
	/** A native call is in flight; a second trigger waits for it. */
	inFlight: boolean;
}

const ledgers = new WeakMap<ConsentClient, AutoPresentLedger>();

const ledgerFor = function ledgerFor(client: ConsentClient): AutoPresentLedger {
	let ledger = ledgers.get(client);
	if (ledger === undefined) {
		ledger = { inFlight: false, presented: null };
		ledgers.set(client, ledger);
	}
	return ledger;
};

/**
 * Name the owed prompt a snapshot describes.
 *
 * Two snapshots owe the same prompt when the matched policy, the kind of prompt
 * and the reason all agree. A new policy or an expired choice changes the key,
 * which is what makes the prompt present again. The native presenters key their
 * own suppression the same way.
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
	return `${snapshot.resolution.fingerprint ?? ''}:${requirement.kind}:${reason}`;
};

/**
 * Hand an owed prompt to native unless this client already did.
 *
 * A failed call, or a native answer that nothing is owed, forgets the key, so
 * the next trigger tries again. A prompt the subject dismissed keeps its key and
 * stays closed until the requirement changes.
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
	if (key === null) {
		if (!ledger.inFlight) {
			ledger.presented = null;
		}
		return;
	}
	if (ledger.inFlight || ledger.presented === key) {
		return;
	}
	ledger.presented = key;
	ledger.inFlight = true;
	try {
		const session = await presentConsentPrompt(privacyPolicyURL);
		if (session.status === 'not-required') {
			ledger.presented = null;
		}
	} catch {
		// No foreground window yet, or the native host refused. The next snapshot
		// change or return to the foreground tries again.
		ledger.presented = null;
	} finally {
		ledger.inFlight = false;
	}
};

const HTTPS_URL = /^https:\/\/[^\s/?#]+/iu;

/**
 * Refuse a privacy-policy URL the native host would reject, at render time.
 *
 * @param privacyPolicyURL - The value the app passed.
 * @throws {TypeError} When it is missing or is not an absolute HTTPS URL.
 */
export const assertPrivacyPolicyURL: (
	privacyPolicyURL: string | undefined
) => asserts privacyPolicyURL is string = function assertPrivacyPolicyURL(
	privacyPolicyURL
) {
	if (privacyPolicyURL === undefined || !HTTPS_URL.test(privacyPolicyURL)) {
		throw new TypeError(
			'<ConsentProvider> presents the consent prompt and needs an HTTPS privacyPolicyURL. Pass privacyPolicyURL="https://…", or autoPresent={false} to present it yourself.'
		);
	}
};
