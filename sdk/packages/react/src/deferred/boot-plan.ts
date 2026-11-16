/**
 * A deferred root's first-render plan, from boot data only the mount it
 * was rendered for may use.
 *
 * @packageDocumentation
 * @internal
 */

import { useLayoutEffect, useState } from 'react';

import { CONSENT_BOOT_ATTRIBUTE, readConsentBoot } from './boot';
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
