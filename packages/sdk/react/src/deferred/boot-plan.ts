/**
 * A deferred root's first-render plan, from boot data only the mount it
 * was rendered for may use, and the checks a root plans its engine load
 * with. Only roots import this module. `./boot` also loads with the
 * trigger, which the dialog's chunk imports, so a rule `./boot` called
 * from `plain-scripts` would move that module out of the registry's
 * first-load file into one of its own.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import { awaitsChoice } from '@inth/sdk/surface-actions/plain-scripts';
import { useLayoutEffect, useState } from 'react';

import {
	CONSENT_BOOT_ATTRIBUTE,
	canDeferEngineAfterChoice,
	iabProviderLoaded,
	readConsentBoot,
	storedChoiceCurrent,
} from './boot';
import type { ConsentBoot } from './boot';

/** Boot data elements a committed root has planned from. */
const consumed = new WeakSet<Element>();

/**
 * Plans a root's first render from the document's boot data, once. The
 * boot data describes the state the server rendered, so only the mount
 * that hydrates that HTML may plan from it: the element is marked consumed
 * when that mount commits, and a later mount, such as a remount after a
 * client-side navigation, gets `null` and takes the eager engine.
 *
 * Render only reads. A render thrown away before it commits (a descendant
 * that suspends outside a boundary, a restarted concurrent render) leaves
 * the boot data for the retry. StrictMode's mount, unmount and mount in
 * development keep the state, and so the plan, of the one committed mount.
 *
 * @param plan - Decides the plan from the boot data, or `null`.
 * @returns The plan the root's first render made.
 * @internal
 */
export const useConsentBootPlan = function useConsentBootPlan<Plan>(
	plan: (boot: ConsentBoot | null) => Plan
): Plan {
	// oxlint-disable-next-line react/hook-use-state -- Decided once, at mount.
	const [first] = useState(() => {
		const element = document.querySelector(`script[${CONSENT_BOOT_ATTRIBUTE}]`);
		const boot = element && !consumed.has(element) ? readConsentBoot() : null;
		return { element, plan: plan(boot) };
	});
	useLayoutEffect(() => {
		if (first.element) {
			consumed.add(first.element);
		}
	}, [first]);
	return first.plan;
};

/**
 * Whether a root can start the plain scripts this visitor's stored choice
 * allows without its engine, and let the engine wait for the page's
 * priority images: a returning visitor who chose
 * ({@link canDeferEngineAfterChoice}), and whose browser holds nothing
 * newer than what the server read ({@link storedChoiceCurrent}). When the
 * browser's records differ, a GPC signal the server did not see, a newer
 * stored denial, or an expired decision, the engine applies them when it
 * loads and the app's callbacks hear the change, so it loads at once.
 *
 * @param snapshot - The snapshot the visitor's page renders from.
 * @returns `true` when the root starts the scripts itself.
 * @internal
 */
export const startsScriptsWithoutEngine = function startsScriptsWithoutEngine(
	snapshot: ConsentSnapshot
): boolean {
	return (
		!awaitsChoice(snapshot) &&
		canDeferEngineAfterChoice(snapshot) &&
		storedChoiceCurrent()
	);
};

/**
 * Whether a root's engine starts downloading as soon as its chunk runs,
 * ahead of hydration: the app loaded `IABProvider`, which the shell cannot
 * serve ({@link iabProviderLoaded}), or the page's boot data names a
 * visitor the engine must serve at once.
 *
 * @param root - Where the page's boot data is.
 * @returns `true` when the engine loads at once.
 * @internal
 */
export const engineNeededAtLoad = function engineNeededAtLoad(
	root: ParentNode = document
): boolean {
	if (iabProviderLoaded()) {
		return true;
	}
	const boot = readConsentBoot(root);
	const snapshot = boot && (boot.r ?? boot.s);
	return Boolean(
		snapshot && !awaitsChoice(snapshot) && !startsScriptsWithoutEngine(snapshot)
	);
};
