/**
 * The consent snapshots a server render leaves in the HTML for a deferred
 * root, and the browser side that reads them back. The reader is here,
 * apart from the server renderer, so the first-load chunk carries only it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@c15t/core';

/** Attribute on the `<script type="application/json">` element. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-c15t-boot';

/** What the server leaves. @internal */
export interface ConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/**
	 * The snapshot a streamed consent surface rendered from, once the
	 * streamed state resolved. Absent when it is `s`.
	 */
	r?: ConsentSnapshot;
}

/**
 * Reads the snapshots a server render left in the document.
 *
 * @param root - Where to look. Defaults to `document`.
 * @returns The snapshots, or `null` without a parseable element.
 * @internal
 */
export const readConsentBoot = function readConsentBoot(
	root: ParentNode = document
): ConsentBoot | null {
	const element = root.querySelector(`script[${CONSENT_BOOT_ATTRIBUTE}]`);
	const text = element?.textContent;
	if (!text) {
		return null;
	}
	try {
		const boot = JSON.parse(text) as ConsentBoot;
		return boot?.s ? boot : null;
	} catch {
		return null;
	}
};

/**
 * Whether a visitor in this state loses nothing when the engine loads
 * late: the banner asks them to choose and no optional category the page
 * uses may run. Until they tap, nothing the engine does is visible or
 * allowed. The page's categories are the configured and discovered ones
 * when there are any; a category outside the policy's scope counts as
 * allowed, so a page that names none defers only when nothing is.
 *
 * @param snapshot - The snapshot the visitor's page renders from.
 * @returns `true` when the engine can wait.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot
): boolean {
	return (
		snapshot.activeUI === 'banner' &&
		snapshot.model !== 'iab' &&
		!snapshot.externalPermissions &&
		!snapshot.experimentPending &&
		!snapshot.experiment &&
		(snapshot.consentCategories ?? Object.keys(snapshot.effectivePermissions))
			.filter((category) => category !== 'necessary')
			.every(
				(category) =>
					!snapshot.effectivePermissions[
						category as keyof typeof snapshot.effectivePermissions
					]
			)
	);
};

/** The root options {@link rootNeedsEngine} reads. @internal */
export interface RootEngineInputs {
	networkBlocker?: { enabled?: boolean } | false;
	options?: { enabled?: boolean; experiment?: unknown };
}

/**
 * Whether the root's own options need the engine from its first render,
 * whatever the visitor's snapshot says: a root turned off, an experiment,
 * or an enabled network blocker, which has to be in place before the
 * page's code sends a request. The adapters render such a root eagerly,
 * and their server render preloads the engine for it.
 *
 * @param root - The root's `networkBlocker` and `options`.
 * @returns `true` when the engine cannot wait.
 * @internal
 */
export const rootNeedsEngine = function rootNeedsEngine({
	networkBlocker,
	options,
}: RootEngineInputs): boolean {
	return Boolean(
		options?.experiment ||
		options?.enabled === false ||
		(networkBlocker && networkBlocker.enabled !== false)
	);
};

/**
 * Whether `@c15t/react/iab` (`IABProvider`) has loaded. Its module marks a
 * registry symbol when it evaluates, which happens before a root that
 * renders it. The key is the one `markIABProviderLoaded` sets; a test keeps
 * them equal.
 *
 * @returns `true` when the app renders IAB surfaces.
 * @internal
 */
export const iabProviderLoaded = function iabProviderLoaded(): boolean {
	return (
		(globalThis as Record<symbol, unknown>)[
			Symbol.for('c15t.react.iab-provider')
		] === true
	);
};
