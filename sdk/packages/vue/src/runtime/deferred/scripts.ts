/**
 * The app's `scripts` before the consent engine loads: whether one may run
 * under a snapshot, and inserting the plain ones a choice allows the way
 * the script loader would, so the loader adopts them when it arrives.
 * Small, for the first-load chunk. Same rules as `@c15t/react`'s deferred
 * root.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot, HasCondition } from '@c15t/core';
import type { Script } from '@c15t/core/modules/script-loader';

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
 * effective permissions. Vendor and IAB checks are left to the loader.
 *
 * @param script - A configured script.
 * @param snapshot - The snapshot to read.
 * @returns `true` when the loader would run it.
 * @internal
 */
export const isRunnableNow = function isRunnableNow(
	script: Pick<Script, 'alwaysLoad' | 'category'>,
	snapshot: ConsentSnapshot
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
 * Whether a script is only a `src` and element attributes.
 *
 * @param script - A configured script.
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
 * adopts one the server's inline start inserted (`__c15tStarted`, see
 * `@c15t/core/runtime/script-server-start`).
 */
type StartedElement = HTMLScriptElement & {
	__c15tScript?: string;
	__c15tConsent?: boolean;
	__c15tDone?: 'load' | 'error';
};

/**
 * Inserts the plain scripts `snapshot` allows, as the loader would, and
 * registers each for the loader to adopt once it runs. A script already
 * started is left alone.
 *
 * @param scripts - The app's configured scripts.
 * @param snapshot - The snapshot that allows them.
 * @param nonce - The app's CSP nonce.
 * @internal
 */
export const startPlainScripts = function startPlainScripts(
	scripts: readonly Script[],
	snapshot: ConsentSnapshot,
	nonce: string | undefined
): void {
	const host = window as unknown as {
		__c15tStarted?: Record<string, StartedElement>;
	};
	host.__c15tStarted ??= {};
	const started = host.__c15tStarted;
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
	}
};
