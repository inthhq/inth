/**
 * Plain scripts a choice allows, started before the script loader exists.
 *
 * A page that defers the consent engine (a deferred React root, the
 * script tag's init script) still wants a granted script's request to
 * leave at the tap, or at once for a returning visitor. These helpers
 * decide which of the page's `scripts` that is safe for and insert them
 * the way the loader would. The loader adopts each element when it
 * mounts, as it adopts one a server start inserted (`STARTED_KEY` in
 * `../libs/page-globals`).
 *
 * Small and free of the kernel, so a first-load chunk can carry them.
 *
 * @packageDocumentation
 * @internal
 */

import type { HasCondition } from '../libs/has';
import { STARTED_KEY, startedElements } from '../libs/page-globals';
import type { StartedElement } from '../libs/page-globals';
import type { Script } from '../libs/script-loader/types';
import type { ConsentSnapshot } from '../types';

export { evaluateCategoryGate } from '../modules/category-gate';

type Condition = HasCondition<string>;

/**
 * `has()`'s evaluator, small enough for a first-load chunk. It decides as
 * `has()` does and throws where `has()` throws: on an empty AND or OR, a
 * category the permissions do not name, and any other shape (a bare
 * array, `{}`, `null`). Its caller treats a throw as "do not run", as the
 * loader does. `plain-scripts-conditions.test.ts` runs every condition
 * form through both, so keep the two in step.
 */
const allows = function allows(
	condition: Condition,
	granted: Record<string, boolean | undefined>
): boolean {
	if (typeof condition === 'string') {
		if (condition in granted) {
			return granted[condition] === true;
		}
	} else if (typeof condition === 'object' && condition !== null) {
		const all = 'and' in condition;
		if (all || 'or' in condition) {
			const part = all ? condition.and : condition.or;
			const parts = Array.isArray(part) ? part : [part];
			if (parts.length > 0) {
				return all
					? parts.every((each) => allows(each, granted))
					: parts.some((each) => allows(each, granted));
			}
		} else if ('not' in condition) {
			return !allows(condition.not, granted);
		}
	}
	throw new TypeError('condition');
};

/**
 * Whether the script loader would run `script` with `snapshot`:
 * `alwaysLoad`, or its category condition holds for the snapshot's
 * effective permissions. Vendor and IAB checks are left to the loader;
 * a deferred page never stands in for an IAB visitor.
 *
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

/**
 * Fields that need the script loader to start a script. Every other
 * `Script` field is one `startPlainScripts` applies as the loader would;
 * `plain-script-fields.test.ts` fails when a field is in neither list.
 *
 * @internal
 */
export const LOADER_FIELDS = [
	'alwaysLoad',
	// The loader gives the element its id before appending it, which a
	// script's code may read from `document.currentScript`; a page start
	// sets none.
	'anonymizeId',
	'callbackOnly',
	'iabLegIntPurposes',
	'iabPurposes',
	'iabSpecialFeatures',
	// The script registry may move it to another URL first, or hold it.
	'integration',
	'observeConsentBeforeLoad',
	'onBeforeLoad',
	'onConsentChange',
	'onDispose',
	'onError',
	'onLoad',
	// The loader keeps such an element after a revoke without a page mark,
	// so only it can tell whether the element is already there.
	'persistAfterConsentRevoked',
	// Its element stays on dispose while its registry entry goes.
	'persistAfterDispose',
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
 * @returns `true` for a plain external script.
 * @internal
 */
export const isPlainScript = function isPlainScript(script: Script): boolean {
	return (
		// Not empty: an empty src resolves to the page's URL, and the loader
		// rejects it.
		typeof script.src === 'string' &&
		script.src !== '' &&
		LOADER_FIELDS.every((field) => script[field] === undefined)
	);
};

/**
 * Whether the loader reports consent to `script` before it loads it
 * (`observeConsentBeforeLoad` with `onConsentChange`): it calls the
 * callback with the first decision, a denial too, as soon as it mounts.
 * Integrations use that call to switch a shared SDK off, so only the
 * engine can serve such a script, whether it may run or not.
 *
 * @returns `true` when the script observes consent before it loads.
 * @internal
 */
export const observesConsent = function observesConsent(
	script: Pick<Script, 'observeConsentBeforeLoad' | 'onConsentChange'>
): boolean {
	return (
		script.observeConsentBeforeLoad === true &&
		typeof script.onConsentChange === 'function'
	);
};

/**
 * Fields of a runnable script that need the engine at once even when the
 * server started the script. Only the loader hears its element's `load`
 * or `error`, so waiting would call `onLoad` and `onError` late, or not at
 * all after a navigation. A root that goes before its engine removes what
 * the server start inserted, so only the loader can keep an element
 * (`persistAfterDispose`) or call `onDispose` when it removes one.
 *
 * The others can wait. `onBeforeLoad` is the setup the server start's
 * `serverStart` code already ran before it inserted the element.
 * `persistAfterConsentRevoked` only acts on a revoke, which loads the
 * engine, and its loader adopts the element before it handles the revoke.
 * Meta Pixel and TikTok Pixel set it, so most returning visitors' pages
 * would otherwise load the engine at once.
 * `onConsentChange` reports a change, which takes the engine anyway, and
 * the grant the page started with once the loader adopts the element; a
 * denial it would report before the script loads already loads the engine
 * ({@link observesConsent}).
 *
 * @internal
 */
export const SERVER_STARTED_ENGINE_FIELDS = [
	'onDispose',
	'onError',
	'onLoad',
	'persistAfterDispose',
] as const;

/**
 * Whether one of a root's `scripts` has to wait for the engine: a script
 * that may run now which neither the server start emitted nor the root
 * can start itself (a plain script, with `plainStart`), or a script the
 * loader reports a denial to ({@link observesConsent}). The browser root
 * and the server's stored-choice check both decide from this.
 *
 * @param scripts - The root's `scripts`.
 * @param snapshot - The snapshot the page renders from.
 * @param serverStart - Whether the root's server start is on.
 * @param plainStart - Whether the root starts plain scripts without the
 * engine (a returning visitor's stored choice, with a commit path).
 * @param started - Whether the server start emitted a `serverStart` entry.
 * @returns `true` when the engine has to load at once.
 * @internal
 */
export const scriptsNeedEngine = function scriptsNeedEngine(
	scripts: readonly Script[] | undefined,
	snapshot: Pick<ConsentSnapshot, 'effectivePermissions'>,
	serverStart: boolean,
	plainStart: boolean,
	started: (script: Script) => boolean
): boolean {
	// Some fields of a runnable script need the loader even when the server
	// started it (SERVER_STARTED_ENGINE_FIELDS). One set to `false` does not.
	return Boolean(
		scripts?.some((script) =>
			isRunnableNow(script, snapshot)
				? SERVER_STARTED_ENGINE_FIELDS.some(
						(field) => script[field] !== undefined && script[field] !== false
					) ||
					(!(
						serverStart &&
						script.serverStart &&
						script.src &&
						started(script)
					) &&
						!(plainStart && isPlainScript(script)))
				: observesConsent(script)
		)
	);
};

/** The root options {@link rootNeedsEngine} reads. @internal */
export interface RootEngineInputs {
	clearOnRevocation?: unknown;
	networkBlocker?: { enabled?: boolean } | false;
	options?: { enabled?: boolean; experiment?: unknown };
}

/**
 * Whether a root's own options need the engine from its first render,
 * whatever the visitor's snapshot says: a root turned off, an experiment,
 * an enabled network blocker, which has to be in place before the page's
 * code sends a request, or `clearOnRevocation`, whose cleanup of a denied
 * category's cookies and storage runs only in the engine.
 *
 * @param root - The root's `clearOnRevocation`, `networkBlocker` and
 * `options`.
 * @returns `true` when the engine cannot wait.
 * @internal
 */
export const rootNeedsEngine = function rootNeedsEngine({
	clearOnRevocation,
	networkBlocker,
	options,
}: RootEngineInputs): boolean {
	return Boolean(
		clearOnRevocation ||
		options?.experiment ||
		options?.enabled === false ||
		(networkBlocker && networkBlocker.enabled !== false)
	);
};

const predicateIds = new WeakMap<WeakKey, number>();
let lastPredicateId = 0;

/**
 * How a declaration writes a function under `key`: a callback by being
 * there, and a `callbackOnly` predicate by which one it is, since the
 * loader remounts a script given a new predicate.
 */
const declaredFunction = (key: string, value: WeakKey): string => {
	if (key !== 'callbackOnly') {
		return 'ƒ';
	}
	let id = predicateIds.get(value);
	if (id === undefined) {
		lastPredicateId += 1;
		id = lastPredicateId;
		predicateIds.set(value, id);
	}
	return `ƒ${id}`;
};

/**
 * A script's declaration as an owner holds it: every field, the plain-safe
 * ones and the loader-only ones, with functions as {@link declaredFunction}
 * writes them, or, without `byIdentity`, every function by being there.
 */
const declarationOf = (script: Script, byIdentity = true): string =>
	JSON.stringify(script, (key, value: unknown) => {
		if (typeof value === 'function') {
			return byIdentity ? declaredFunction(key, value) : 'ƒ';
		}
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return Object.fromEntries(Object.entries(value).sort());
		}
		return value;
	});

/**
 * What a script's element runs, the same for every owner that declares
 * it: its declaration without the `id` and `resourceKey` that name it.
 */
const elementDeclarationOf = (script: Script): string =>
	declarationOf({ ...script, id: '', resourceKey: undefined });

/**
 * Inserts the plain scripts `snapshot` grants, as the loader would, and
 * registers each for the loader to adopt once it mounts. A script already
 * started is left alone, and so is one whose resource `reserved` names:
 * the render's server start runs its setup, or reports a failure that
 * loads the engine.
 *
 * @param scripts - The scripts the page's loader would run.
 * @param snapshot - The snapshot that grants them.
 * @param nonce - The page's CSP nonce.
 * @param reserved - The resources this render's server start marked
 * (`starts`), read by the caller through the check that the page object
 * belongs to this render (`pageRender` in `@inth/react/deferred`).
 * @returns The resource keys of the scripts it inserted, for their owner
 * to release ({@link releasePlainScripts}) if it goes before its loader.
 * @internal
 */
export const startPlainScripts = function startPlainScripts(
	scripts: readonly Script[],
	snapshot: Pick<ConsentSnapshot, 'effectivePermissions'>,
	nonce: string | undefined,
	reserved: Readonly<Record<string, unknown>> = {}
): string[] {
	const host = window as unknown as Record<string, unknown>;
	host[STARTED_KEY] ??= {};
	const started = host[STARTED_KEY] as Record<string, StartedElement>;
	const inserted: string[] = [];
	for (const script of scripts) {
		const key = script.resourceKey ?? script.id;
		if (
			started[key] ||
			reserved[key] ||
			!isPlainScript(script) ||
			!isRunnableNow(script, snapshot)
		) {
			continue;
		}
		const element: StartedElement = document.createElement('script');
		element.src = script.src as string;
		element.__inthScript = script.id;
		element.__inthConsent = true;
		element.__inthEarly = true;
		element.__inthPlainDeclaration = elementDeclarationOf(script);
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
			element.__inthDone = event.type === 'load' ? 'load' : 'error';
		};
		element.addEventListener('load', done);
		element.addEventListener('error', done);
		started[key] = element;
		(script.target === 'body'
			? (document.body ?? document.head)
			: document.head
		).append(element);
		inserted.push(key);
	}
	return inserted;
};

/**
 * An owner's declarations, one per resource: the scripts that share a key
 * as one sorted set, so their order does not count as a change and the
 * owner holds the key once.
 */
const declarationsByKey = (scripts: readonly Script[]): Map<string, string> => {
	const groups = new Map<string, string[]>();
	for (const script of scripts) {
		const key = script.resourceKey ?? script.id;
		groups.set(key, [...(groups.get(key) ?? []), declarationOf(script)]);
	}
	return new Map(
		[...groups].map(([key, declarations]) => [
			key,
			JSON.stringify(declarations.sort()),
		])
	);
};

/**
 * Declares an owner of the early-started elements for `scripts`: each one
 * {@link startPlainScripts} inserted, whoever inserted it, gains one owner,
 * once per owner (`owned` maps each key it holds to the declaration it
 * held it with). A hook or root that passes a script someone else started
 * early holds it too, so the element stays until the last owner releases
 * it. One it declares otherwise (a new `src`, a category) is not what it
 * would run: it does not hold that one, and gets its key back, so it asks
 * for the engine, and the element goes with the owners that declare it.
 *
 * @param scripts - The scripts the owner passes.
 * @param owned - The keys this owner holds; updated.
 * @returns The keys of elements started for another declaration.
 * @internal
 */
export const claimPlainScripts = function claimPlainScripts(
	scripts: readonly Script[],
	owned: Map<string, string>
): string[] {
	const started = startedElements();
	const declaredOtherwise: string[] = [];
	for (const [key, declaration] of declarationsByKey(scripts)) {
		const element = started?.[key];
		if (!element?.__inthEarly || owned.has(key)) {
			continue;
		}
		const recorded = element.__inthPlainDeclaration;
		if (
			recorded !== undefined &&
			!scripts.some(
				(script) =>
					(script.resourceKey ?? script.id) === key &&
					elementDeclarationOf(script) === recorded
			)
		) {
			declaredOtherwise.push(key);
			continue;
		}
		element.__inthOwners = (element.__inthOwners ?? 0) + 1;
		owned.set(key, declaration);
	}
	return declaredOtherwise;
};

/**
 * `script`'s declaration as any process writes it, for a value the page
 * carries from one server render to the next (`startHash` in
 * `../runtime/script-server-start`): every function counts by being
 * there, since a function's identity holds only in the process that made
 * it, and another request or server worker makes its own.
 *
 * @internal
 */
export const portableDeclaration = (script: Script): string =>
	declarationOf(script, false);

/**
 * An owner's declarations by resource key, to compare later with
 * {@link obsoletePlainScripts}.
 *
 * @returns Each key's declaration.
 * @internal
 */
export const plainDeclarations = (
	scripts: readonly Script[]
): ReadonlyMap<string, string> => declarationsByKey(scripts);

/**
 * The keys of `keys` that `scripts` no longer declares as `declared`
 * holds them: removed, declared otherwise, or never recorded. What runs for
 * those is no longer what the page started.
 *
 * @param scripts - The scripts the owner passes now.
 * @param declared - Their declarations when the page started them.
 * @param keys - The keys to check.
 * @returns The obsolete keys.
 * @internal
 */
export const obsoletePlainScripts = function obsoletePlainScripts(
	scripts: readonly Script[],
	declared: ReadonlyMap<string, string>,
	keys: Iterable<string>
): string[] {
	const now = declarationsByKey(scripts);
	return [...keys].filter((key) => {
		const before = declared.get(key);
		return before === undefined || now.get(key) !== before;
	});
};

/**
 * The keys an owner holds whose script it now declares differently, by
 * anything but its identity: a new `src`, a category, a callback added.
 * What runs then is no longer what the page started, so the owner
 * releases them and asks for the engine.
 *
 * @param scripts - The scripts the owner passes now.
 * @param owned - The keys it holds, with their declarations.
 * @internal
 */
export const changedPlainScripts = function changedPlainScripts(
	scripts: readonly Script[],
	owned: ReadonlyMap<string, string>
): string[] {
	return [...declarationsByKey(scripts)].flatMap(([key, declaration]) => {
		const held = owned.get(key);
		return held !== undefined && held !== declaration ? [key] : [];
	});
};

/**
 * Drops an owner's hold on early-started elements ({@link
 * claimPlainScripts}). The last owner to go removes the element and its
 * registry entry, as a loader releasing it would, unless a loader already
 * adopted it.
 *
 * @param keys - Keys the owner holds; each is released once.
 * @internal
 */
export const releasePlainScripts = function releasePlainScripts(
	keys: Iterable<string>
): void {
	const started = startedElements();
	for (const key of keys) {
		const element = started?.[key];
		if (!(started && element?.__inthEarly)) {
			continue;
		}
		element.__inthOwners = (element.__inthOwners ?? 1) - 1;
		if (element.__inthOwners <= 0 && !element.__inthAdopted) {
			element.remove();
			Reflect.deleteProperty(started, key);
		}
	}
};

/**
 * Removes the elements render `renderId`'s server start inserted for
 * `keys`, and their registry entries, unless a loader adopted them, an
 * early start's owners hold them, or a later render's start took them
 * over. For a deferred root that goes before its engine: no loader will
 * take them over.
 *
 * @param keys - The resources the render's server start marked.
 * @param renderId - The render whose root goes.
 * @internal
 */
export const releaseServerStartedScripts = function releaseServerStartedScripts(
	keys: Iterable<string>,
	renderId: string
): void {
	const started = startedElements();
	for (const key of keys) {
		const element = started?.[key];
		if (
			started &&
			element &&
			element.__inthStartRender === renderId &&
			!element.__inthEarly &&
			!element.__inthAdopted
		) {
			element.remove();
			Reflect.deleteProperty(started, key);
		}
	}
};
