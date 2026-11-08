/**
 * Plain scripts a choice allows, started before the script loader exists.
 *
 * A page that defers the consent engine (a deferred React root, the
 * script tag's init script) still wants a granted script's request to
 * leave at the tap, or at once for a returning visitor. These helpers
 * decide which of the page's `scripts` that is safe for and insert them
 * the way the loader would. The loader adopts each element when it
 * mounts, as it adopts one a server start inserted (`__c15tStarted`, see
 * `../runtime/script-server-start`).
 *
 * Small and free of the kernel, so a first-load chunk can carry them.
 *
 * @packageDocumentation
 * @internal
 */

import type { HasCondition } from '../libs/has';
import type { Script } from '../libs/script-loader/types';
import type { ConsentSnapshot } from '../types';

export { evaluateCategoryGate } from '../modules/category-gate';

type Condition = HasCondition<string>;

const allows = function allows(
	condition: Condition | Condition[],
	granted: Record<string, boolean | undefined>
): boolean {
	if (Array.isArray(condition)) {
		return condition.every((part) => allows(part, granted));
	}
	if (typeof condition === 'string') {
		return granted[condition] === true;
	}
	if ('and' in condition) {
		return allows(condition.and, granted);
	}
	if ('or' in condition) {
		const parts = Array.isArray(condition.or) ? condition.or : [condition.or];
		return parts.some((part) => allows(part, granted));
	}
	if ('not' in condition) {
		return !allows(condition.not, granted);
	}
	return false;
};

/**
 * Whether the script loader would run `script` with `snapshot`:
 * `alwaysLoad`, or its category condition holds for the snapshot's
 * effective permissions. Vendor and IAB checks are left to the loader;
 * a deferred page never stands in for an IAB visitor.
 *
 * @param script - A script passed to the loader.
 * @param snapshot - The snapshot the page reads.
 * @returns `true` when waiting for the engine would hold the script back.
 * @internal
 */
export const isRunnableNow = function isRunnableNow(
	script: Pick<Script, 'alwaysLoad' | 'category'>,
	snapshot: Pick<ConsentSnapshot, 'effectivePermissions'>
): boolean {
	if (script.alwaysLoad === true) {
		return true;
	}
	try {
		return allows(
			script.category as Condition,
			snapshot.effectivePermissions as Record<string, boolean | undefined>
		);
	} catch {
		return false;
	}
};

/** Fields that need the script loader to start a script. */
const LOADER_FIELDS = [
	'alwaysLoad',
	'callbackOnly',
	'iabLegIntPurposes',
	'iabPurposes',
	'iabSpecialFeatures',
	'observeConsentBeforeLoad',
	'onBeforeLoad',
	'onConsentChange',
	'onDispose',
	'onError',
	'onLoad',
	'serverStart',
	'textContent',
	'validate',
	'vendor',
	'vendorDetails',
	'vendorId',
] as const;

/**
 * Whether a script is only a `src` and element attributes: a page can
 * insert it the way the loader would and leave the loader to adopt it.
 * Callbacks, vendor and IAB checks, inline code and setup stay with the
 * loader.
 *
 * @param script - A script passed to the loader.
 * @returns `true` for a plain external script.
 * @internal
 */
export const isPlainScript = function isPlainScript(script: Script): boolean {
	return (
		typeof script.src === 'string' &&
		LOADER_FIELDS.every((field) => script[field] === undefined)
	);
};

/**
 * A script element the loader adopts when it mounts the script, as it
 * adopts one the server's inline start inserted.
 */
type StartedElement = HTMLScriptElement & {
	__c15tScript?: string;
	__c15tConsent?: boolean;
	__c15tDone?: 'load' | 'error';
};

/**
 * Inserts the plain scripts `snapshot` grants, as the loader would, and
 * registers each for the loader to adopt once it mounts. A script already
 * started or in the document is left alone.
 *
 * @param scripts - The scripts the page's loader would run.
 * @param snapshot - The snapshot that grants them.
 * @param nonce - The page's CSP nonce.
 * @returns How many scripts it inserted.
 * @internal
 */
export const startPlainScripts = function startPlainScripts(
	scripts: readonly Script[],
	snapshot: Pick<ConsentSnapshot, 'effectivePermissions'>,
	nonce: string | undefined
): number {
	const host = window as unknown as {
		__c15tStarted?: Record<string, StartedElement>;
	};
	host.__c15tStarted ??= {};
	const started = host.__c15tStarted;
	let inserted = 0;
	for (const script of scripts) {
		const key = script.resourceKey ?? script.id;
		if (
			started[key] ||
			!isPlainScript(script) ||
			!isRunnableNow(script, snapshot)
		) {
			continue;
		}
		const element: StartedElement = document.createElement('script');
		element.src = script.src as string;
		element.__c15tScript = script.id;
		element.__c15tConsent = true;
		if (script.async !== undefined) {
			element.async = script.async;
		}
		if (script.defer !== undefined) {
			element.defer = script.defer;
		}
		const scriptNonce = script.nonce ?? nonce;
		if (scriptNonce) {
			element.nonce = scriptNonce;
		}
		if (script.fetchPriority) {
			element.setAttribute('fetchpriority', script.fetchPriority);
		}
		for (const [name, value] of Object.entries(script.attributes ?? {})) {
			element.setAttribute(name, String(value));
		}
		const done = (event: Event) => {
			element.__c15tDone = event.type === 'load' ? 'load' : 'error';
		};
		element.addEventListener('load', done);
		element.addEventListener('error', done);
		started[key] = element;
		(script.target === 'body'
			? (document.body ?? document.head)
			: document.head
		).append(element);
		inserted += 1;
	}
	return inserted;
};
