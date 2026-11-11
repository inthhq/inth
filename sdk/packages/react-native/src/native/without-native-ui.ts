/**
 * Checks for a build with `c15t.nativeUI` false, which has no stock native
 * consent screens. Nothing else in such a build can collect consent, so the two
 * ways it ends up collecting none get said out loud: a prompt nobody renders,
 * and an IAB configuration no custom screen can disclose.
 */

import { isStatusPromptOwed, selectConsentStatus } from '../lib/selectors';
import type { ConsentSnapshot } from '../protocol';

/** How long an owed prompt may go unclaimed before a development build warns. */
export const UNCLAIMED_PROMPT_MS = 3000;

/** The slice of a client the checks read. */
interface WatchedClient {
	readonly getSnapshot: () => ConsentSnapshot;
	readonly subscribe: (
		selector: (snapshot: ConsentSnapshot) => ConsentSnapshot,
		onStoreChange: () => void
	) => () => void;
}

/** Mounted prompt surfaces per client. */
const claims = new WeakMap<WatchedClient, number>();

/** Each watched client's check, run again when its last surface unmounts. */
const rechecks = new WeakMap<WatchedClient, () => void>();

/**
 * Say that a surface which renders the owed prompt is mounted for `client`.
 *
 * `ConsentPrompt` and `ConsentBanner` call it on mount.
 *
 * @param client - The consent client the surface reads.
 * @returns The release function, for unmount.
 * @internal
 */
export const claimPrompt = function claimPrompt(
	client: WatchedClient
): () => void {
	claims.set(client, (claims.get(client) ?? 0) + 1);
	let released = false;
	return () => {
		if (!released) {
			released = true;
			const left = (claims.get(client) ?? 1) - 1;
			claims.set(client, left);
			// Nothing renders the prompt any more, and no snapshot change may come
			// to say so: look again now.
			if (left === 0) {
				rechecks.get(client)?.();
			}
		}
	};
};

const unsupportedIABMessage = (gaps: readonly string[]): string =>
	`c15t: this build has no stock native consent screens (c15t.nativeUI is false), and the IAB TCF configuration needs them: ${gaps.join(' and ')} cannot be disclosed by a custom screen, so useIAB() stays null and no TCF decision can be collected. Build with the stock screens (remove nativeUI: false), or serve a configuration without publisher restrictions or Additional Consent providers.`;

const UNCLAIMED_PROMPT_MESSAGE = `c15t: a consent prompt has been owed for ${String(UNCLAIMED_PROMPT_MS / 1000)} seconds, but this build has no stock native consent screens (c15t.nativeUI is false) and no <ConsentPrompt> or <ConsentBanner> is mounted. Optional categories stay denied until the subject answers. Mount one of them; if your app renders its own prompt another way, wrap it in <ConsentPrompt>.`;

/**
 * Watch a client in a build without the stock native screens.
 *
 * An IAB configuration a custom screen cannot disclose is reported with
 * `console.error` in every build, once per distinct set of reasons; React
 * Native shows it at startup in development. A prompt owed for
 * {@link UNCLAIMED_PROMPT_MS} with no surface claimed warns once, in development
 * only.
 *
 * @param client - The client to watch.
 * @param production - Whether this is a production bundle.
 * @returns The function that stops watching.
 * @internal
 */
export const watchWithoutNativeUI = function watchWithoutNativeUI(
	client: WatchedClient,
	production: boolean
): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let warned = false;
	let reported = '';

	const owed = (): boolean =>
		isStatusPromptOwed(selectConsentStatus(client.getSnapshot()));

	const check = function check(): void {
		const snapshot = client.getSnapshot();
		const gaps =
			snapshot.model === 'iab' ? (snapshot.iab?.headlessUnsupported ?? []) : [];
		const signature = gaps.join(',');
		if (signature !== reported) {
			reported = signature;
			if (gaps.length > 0) {
				console.error(unsupportedIABMessage(gaps));
			}
		}
		if (production || warned) {
			return;
		}
		if (!owed()) {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			return;
		}
		timer ??= setTimeout(() => {
			timer = null;
			if (!warned && (claims.get(client) ?? 0) === 0 && owed()) {
				warned = true;
				console.warn(UNCLAIMED_PROMPT_MESSAGE);
			}
		}, UNCLAIMED_PROMPT_MS);
	};

	const unsubscribe = client.subscribe((snapshot) => snapshot, check);
	rechecks.set(client, check);
	check();
	return () => {
		unsubscribe();
		rechecks.delete(client);
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};
};
