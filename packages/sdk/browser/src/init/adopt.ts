/**
 * The engine's side of the handoff: the init script's boot object, kept
 * once `installGlobal` has replaced the stand-in, until the client and
 * the UI have taken what they need from it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ScriptTagClientOptions } from '../types';
import { version } from '../version';
import type { InitBoot, InitUI } from './boot';
import { supportsEarlyStart } from './eligibility';
import { readHostedMarker } from './hosted-marker';

let adopted: InitBoot | null = null;

/** Whether the client was given the init script's `/init` answer. */
let startedFromInit = false;

const dropInitUI = function dropInitUI(boot: InitBoot): void {
	const { ui } = boot;
	if (!ui) {
		return;
	}
	boot.ui = null;
	ui.takeBanner()?.release();
	ui.takeDialog()?.destroy();
	ui.releaseScheme();
	ui.host.remove();
};

/**
 * Keep the boot object the engine was installed over.
 *
 * @internal
 */
export const adoptBoot = function adoptBoot(boot: InitBoot): void {
	adopted = boot;
	if (boot.version !== version) {
		// A cached init script from another release: its banner may not match
		// this engine's markup or sheet, so this engine renders its own.
		dropInitUI(boot);
	}
};

/**
 * The init script's UI root, for the first `mountConsentUI` that renders
 * where the init script did: the default container, in a shadow root. Any
 * other mount, or a second one, gets none, and the init script's root is
 * removed.
 *
 * @internal
 */
export const takeInitUI = function takeInitUI(fits: boolean): InitUI | null {
	const boot = adopted;
	if (!boot?.ui) {
		return null;
	}
	if (!fits) {
		dropInitUI(boot);
		return null;
	}
	const { ui } = boot;
	boot.ui = null;
	return ui;
};

/**
 * Forget the boot object, removing any UI nobody took. Called when the
 * client it was handed to is disposed.
 *
 * @internal
 */
export const releaseBoot = function releaseBoot(): void {
	if (adopted) {
		dropInitUI(adopted);
	}
	adopted = null;
};

/**
 * The boot object the engine was installed over, if any.
 *
 * @internal
 */
export const adoptedBoot = function adoptedBoot(): InitBoot | null {
	return adopted;
};

/**
 * `options` with the `/init` answer the init script read as `prefetch`,
 * when they send the same request: the engine then starts with the policy
 * and sends no `/init` of its own. Evaluated now, after any choice the
 * init script stored.
 *
 * @internal
 */
export const withInitPrefetch = function withInitPrefetch(
	options: ScriptTagClientOptions
): ScriptTagClientOptions {
	const handed = adopted?.prefetch;
	if (!handed || adopted?.version !== version) {
		return options;
	}
	const projectUrl =
		options.projectUrl ?? readHostedMarker(options.mode)?.projectUrl;
	if (
		projectUrl !== handed.projectUrl ||
		!supportsEarlyStart(options, projectUrl) ||
		JSON.stringify(options.overrides ?? {}) !==
			JSON.stringify(handed.overrides ?? {})
	) {
		return options;
	}
	adopted.prefetch = null;
	startedFromInit = true;
	return { ...options, prefetch: { ...handed.config, now: Date.now() } };
};

/**
 * After the client started: send the save the init script queued for an
 * early accept or reject. A client that ran `init()` replays the outbox
 * itself; one given the init script's answer runs none, so it is asked to,
 * as a deferred React root asks its engine.
 *
 * @internal
 */
export const sendInitCommit = function sendInitCommit(kernel: unknown): void {
	const queued = adopted?.commit?.queued;
	if (!(startedFromInit && queued)) {
		return;
	}
	startedFromInit = false;
	// oxlint-disable-next-line promise/prefer-await-to-then -- Called from a synchronous start.
	void queued.then((ok) => {
		if (ok) {
			(kernel as { replaySaves?: () => void }).replaySaves?.();
		}
	});
};
