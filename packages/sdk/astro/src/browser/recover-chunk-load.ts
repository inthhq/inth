/**
 * Recovers the consent engine or prompt chunk after a failed download.
 *
 * Chromium remembers a failed module fetch for the life of the document.
 * Every later `import()` of that URL, and of every chunk that statically
 * imports it, fails from the module map and sends no request. A tap on
 * the banner after a failed load therefore fails again at once, and the
 * choice is never recorded.
 *
 * A fresh URL (`?retry=1`) does not get past this for these chunks. Other
 * chunks import both of them by their plain URL: the prompt and the testing
 * transport import the engine's chunk, and the prompt panel imports the
 * prompt's. A copy loaded from a fresh URL leaves those imports failing in
 * Chromium. In a browser that does not cache the failure, the copy runs as
 * a second instance beside the plain one, with its own kernel state.
 *
 * Only a new document fetches the chunk again. So when a visitor's retry
 * fails, the chunk answers again, and this page has not just reloaded for
 * the same reason, the page reloads. The choice the visitor tapped is
 * applied once on the reloaded page ({@link replayPendingChoice}).
 *
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';

/** A banner choice, as the shell's `choose` takes it. @internal */
export type RecoveredChoice = 'all' | 'none' | Partial<Record<string, boolean>>;

/** The client calls a recovered choice needs. @internal */
export interface ChoiceTarget {
	acceptAll: () => Promise<void>;
	getConsent: () => ConsentSnapshot;
	rejectAll: () => Promise<void>;
	save: (consents: Partial<Record<string, boolean>>) => Promise<void>;
	subscribe: (listener: (snapshot: ConsentSnapshot) => void) => () => void;
}

const PENDING_CHOICE_KEY = 'inth:astro:pending-choice';
const RELOAD_KEY = 'inth:astro:chunk-reload';

/**
 * How long a stored choice stays valid, and how long after a reload the
 * page does not reload again for a failed chunk.
 */
const RECOVERY_WINDOW_MS = 30_000;

const defaultReload = (): void => {
	window.location.reload();
};

let reloadPage = defaultReload;

/**
 * Replaces the page reload, so a test can see it. Call with no argument
 * to restore the real one.
 *
 * Tests only.
 *
 * @internal
 */
export const setPageReloadForTest = function setPageReloadForTest(
	reload?: () => void
): void {
	reloadPage = reload ?? defaultReload;
};

const sessionStore = (): Storage | null => {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
};

/**
 * What Chromium and Firefox throw for a module that failed to download,
 * naming the chunk.
 */
const MODULE_LOAD_FAILURE =
	/dynamically imported module:? (?<url>https?:\/\/\S+)/iu;

/**
 * The chunk a failed `import()` names, or `null` when the error is not a
 * failed module download or does not name one. WebKit's error names none,
 * and WebKit keeps the failed chunk across a reload too, so a reload
 * would not recover it there.
 *
 * @internal
 */
export const failedChunkUrl = function failedChunkUrl(
	error: unknown
): URL | null {
	const message = error instanceof Error ? error.message : String(error);
	const url = MODULE_LOAD_FAILURE.exec(message)?.groups?.url;
	if (!url) {
		return null;
	}
	try {
		return new URL(url);
	} catch {
		return null;
	}
};

/**
 * The last accept or reject among the taps the early-tap script holds.
 *
 * @internal
 */
export const choiceFromTaps = function choiceFromTaps(
	taps: readonly EarlyConsentTap[] | undefined
): RecoveredChoice | null {
	const held = taps ?? [];
	for (let index = held.length - 1; index >= 0; index -= 1) {
		const tap = held[index];
		if (tap?.action === 'accept') {
			return 'all';
		}
		if (tap?.action === 'reject') {
			return 'none';
		}
	}
	return null;
};

/**
 * Reload the page when a visitor's retry of a chunk failed and the chunk
 * answers again, keeping the choice they tapped for the reloaded page.
 *
 * Does nothing while the browser is offline, when the error names no
 * chunk, when the chunk still does not answer, or within
 * {@link RECOVERY_WINDOW_MS} of a reload this started, so a chunk that
 * keeps failing cannot reload the page in a loop.
 *
 * Call it only for a load a visitor's tap retried: a load that fails on
 * its own must not reload the page under them.
 *
 * @param error - What the failed `import()` threw.
 * @param choice - The choice the tap asked for, if any.
 * @returns Whether the page is reloading.
 * @internal
 */
export const recoverChunkLoad = async function recoverChunkLoad(
	error: unknown,
	choice: RecoveredChoice | null
): Promise<boolean> {
	if (navigator.onLine === false) {
		return false;
	}
	const url = failedChunkUrl(error);
	const storage = sessionStore();
	if (!url || !storage) {
		return false;
	}
	const now = Date.now();
	try {
		const last = Number(storage.getItem(RELOAD_KEY));
		if (last > 0 && now - last < RECOVERY_WINDOW_MS) {
			return false;
		}
	} catch {
		return false;
	}
	try {
		const response = await fetch(url, { cache: 'no-store', method: 'HEAD' });
		if (!response.ok) {
			return false;
		}
	} catch {
		return false;
	}
	try {
		storage.setItem(RELOAD_KEY, String(now));
		if (choice) {
			storage.setItem(
				PENDING_CHOICE_KEY,
				JSON.stringify({ at: now, choice, path: window.location.pathname })
			);
		} else {
			storage.removeItem(PENDING_CHOICE_KEY);
		}
	} catch {
		return false;
	}
	reloadPage();
	return true;
};

const isChoice = (value: unknown): value is RecoveredChoice =>
	value === 'all' ||
	value === 'none' ||
	(typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === 'boolean'));

/**
 * Take the choice {@link recoverChunkLoad} kept for this page, once. A
 * choice kept for another path, or more than {@link RECOVERY_WINDOW_MS}
 * ago, is dropped.
 *
 * @internal
 */
export const takePendingChoice =
	function takePendingChoice(): RecoveredChoice | null {
		const storage = sessionStore();
		let raw: string | null = null;
		try {
			raw = storage?.getItem(PENDING_CHOICE_KEY) ?? null;
			storage?.removeItem(PENDING_CHOICE_KEY);
		} catch {
			return null;
		}
		if (!raw) {
			return null;
		}
		try {
			const { at, choice, path } = JSON.parse(raw) as {
				at?: unknown;
				choice?: unknown;
				path?: unknown;
			};
			const age = typeof at === 'number' ? Date.now() - at : -1;
			if (
				age < 0 ||
				age > RECOVERY_WINDOW_MS ||
				path !== window.location.pathname ||
				!isChoice(choice)
			) {
				return null;
			}
			return choice;
		} catch {
			return null;
		}
	};

/**
 * Record a choice a visitor tapped while the chunk that would have
 * recorded it failed to load.
 *
 * @internal
 */
export const applyRecoveredChoice = async function applyRecoveredChoice(
	client: Pick<ChoiceTarget, 'acceptAll' | 'rejectAll' | 'save'>,
	choice: RecoveredChoice
): Promise<void> {
	try {
		if (choice === 'all') {
			await client.acceptAll();
		} else if (choice === 'none') {
			await client.rejectAll();
		} else {
			await client.save(choice);
		}
	} catch (error) {
		console.warn('@inth/astro: the consent choice was not stored.', error);
	}
};

/**
 * Apply the choice kept across a recovery reload, once the client knows
 * the policy, and only while the banner still asks for one.
 *
 * @internal
 */
export const replayPendingChoice = function replayPendingChoice(
	client: ChoiceTarget
): void {
	const choice = takePendingChoice();
	if (!choice) {
		return;
	}
	let unsubscribe: (() => void) | undefined;
	let settled = false;
	const apply = (snapshot: ConsentSnapshot): void => {
		if (settled || snapshot.policyPending) {
			return;
		}
		settled = true;
		unsubscribe?.();
		if (snapshot.activeUI === 'banner') {
			void applyRecoveredChoice(client, choice);
		}
	};
	apply(client.getConsent());
	if (!settled) {
		unsubscribe = client.subscribe(apply);
	}
};
