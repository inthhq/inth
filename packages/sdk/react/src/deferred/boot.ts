/**
 * The consent snapshots a server render leaves in the HTML for a deferred
 * root, and the browser side that reads them back. The reader is here,
 * apart from the server renderer, so the first-load chunk carries only it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import {
	ENDED_RENDERS_KEY,
	ENDED_RENDERS_LIMIT,
	PAGE_RENDER_KEY,
} from '@inth/sdk/runtime/page-globals';

/** Attribute on the `<script type="application/json">` element. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-inth-boot';

/** What the server leaves. @internal */
export interface ConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/**
	 * The snapshot a streamed consent surface rendered from, once the
	 * streamed state resolved. Absent when it is `s`.
	 */
	r?: ConsentSnapshot;
	/**
	 * The server render's id: the page object its inline scripts wrote
	 * (`pageRender`) belongs to this boot data only when the ids match.
	 */
	i?: string;
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
 * What a server render's inline scripts leave for its deferred root
 * (`PAGE_RENDER_KEY` in `@inth/sdk/runtime/page-globals`).
 * @internal
 */
export interface PageRender {
	id?: string;
	/** Runs the stored-choice check again; `true` while it holds. */
	current?: () => unknown;
	/** The resources the server start emits, by `resourceKey ?? id`. */
	starts?: Record<string, unknown>;
	/** Set when a marked server start failed in the browser. */
	failed?: unknown;
}

/**
 * The page object this document's boot data was rendered with, or
 * `undefined` when there is none or it belongs to another render (an
 * earlier one before a client-side navigation or a remount). Every value a
 * deferred root reads from the server's inline scripts comes through here.
 *
 * @param renderId - The render to read. Defaults to the one the document's
 * boot data names; a root passes the one it mounted with.
 * @returns This render's page object.
 * @internal
 */
export const pageRender = function pageRender(
	renderId: string | undefined = readConsentBoot()?.i
): PageRender | undefined {
	const render = (globalThis as Record<string, unknown>)[PAGE_RENDER_KEY] as
		| PageRender
		| undefined;
	const id = render?.id;
	return id !== undefined && id === renderId ? render : undefined;
};

/**
 * Ends this document's render for its inline scripts. It records the id
 * among the ended renders ({@link ENDED_RENDERS_KEY}), which a newer render's page
 * object never replaces, so a start script of this render that streams in
 * later installs nothing. It also renames the page object, so a server
 * start still waiting to run, or to insert a script after the page's
 * priority images, finds another render and does nothing. Elements it
 * already inserted stay. For a deferred root that goes before its engine.
 * A render that is no longer the page's is only recorded as ended.
 *
 * @param id - The render the root mounted with, as its boot data named it.
 * @internal
 */
export const endPageRender = function endPageRender(
	id: string | undefined
): void {
	if (id === undefined) {
		return;
	}
	const page = globalThis as Record<string, unknown>;
	const recorded = page[ENDED_RENDERS_KEY];
	const ended = Array.isArray(recorded) ? (recorded as unknown[]) : [];
	if (!ended.includes(id)) {
		ended.push(id);
		ended.splice(0, Math.max(0, ended.length - ENDED_RENDERS_LIMIT));
	}
	page[ENDED_RENDERS_KEY] = ended;
	// Only this render's own page object: a newer render's stays as it is.
	const render = pageRender(id);
	if (render) {
		render.id = `${render.id}:ended`;
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

/**
 * Whether a visitor in this state already chose, sees no consent surface,
 * and needs nothing from the engine that shows: a returning visitor whose
 * stored choice the server read. The page renders from the server's
 * snapshot, and the root starts the plain scripts the choice allows
 * without the engine (`startPlainScripts`). Loading the engine's chunks
 * before the page's priority images would share bandwidth with them and
 * delay Largest Contentful Paint, so the engine can wait for them as it
 * does for a visitor who still has to choose.
 *
 * @param snapshot - The snapshot the visitor's page renders from.
 * @returns `true` when the engine can wait for the page's priority images.
 * @internal
 */
export const canDeferEngineAfterChoice = function canDeferEngineAfterChoice(
	snapshot: ConsentSnapshot
): boolean {
	return (
		snapshot.activeUI === 'none' &&
		snapshot.model !== 'iab' &&
		!snapshot.externalPermissions &&
		!snapshot.experimentPending &&
		!snapshot.experiment
	);
};

/**
 * Whether the browser's stored records agree, now, with the state the
 * server read: runs the check the server's inline script left
 * (`storedChoiceCheckScript` in `@inth/sdk/runtime/script-server-start`)
 * again, so a decision that expired or a denial another tab stored since
 * the page parsed counts. `false` when the script did not run or found a
 * difference. Reads render `renderId`'s page object ({@link pageRender}).
 *
 * @param renderId - The render whose check runs. Defaults to the one the
 * document's boot data names; a root's session passes the one it mounted
 * with, as a navigation may have left another render's check since.
 * @returns `true` when the snapshot still holds in this browser.
 * @internal
 */
export const storedChoiceCurrent = function storedChoiceCurrent(
	renderId?: string
): boolean {
	const check = pageRender(renderId)?.current;
	try {
		return typeof check === 'function' && check() === true;
	} catch {
		return false;
	}
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
		!canDeferEngine(snapshot) &&
		canDeferEngineAfterChoice(snapshot) &&
		storedChoiceCurrent()
	);
};

/** Longest delay `setTimeout` takes before it fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Calls `check` whenever a returning visitor's stored choice may have
 * changed while the engine waits: another tab wrote storage, the page
 * became visible or got focus again, or the decision reached `deadline`
 * (the snapshot's `nextDeadline`). The engine, once loaded, listens for
 * these itself.
 *
 * @param check - Runs {@link storedChoiceCurrent} and acts on it.
 * @param deadline - Epoch ms when the decision expires, or `null`.
 * @returns Stops watching.
 * @internal
 */
export const watchStoredChoice = function watchStoredChoice(
	check: () => void,
	deadline: number | null
): () => void {
	const onVisible = (): void => {
		if (document.visibilityState === 'visible') {
			check();
		}
	};
	window.addEventListener('storage', check);
	window.addEventListener('focus', check);
	document.addEventListener('visibilitychange', onVisible);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const arm = (): void => {
		if (deadline === null) {
			return;
		}
		const remaining = deadline - Date.now();
		// A longer delay than `setTimeout` takes would fire at once, so a far
		// deadline waits in steps and checks only when it is reached.
		timer = setTimeout(
			remaining > MAX_TIMEOUT_MS ? arm : check,
			Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS)
		);
	};
	arm();
	return () => {
		window.removeEventListener('storage', check);
		window.removeEventListener('focus', check);
		document.removeEventListener('visibilitychange', onVisible);
		clearTimeout(timer);
	};
};

/**
 * The root props that only shape what the page shows, left out of
 * {@link liveRootKey}: a change to one leaves the plan the root made at
 * mount, and the scripts it starts, as they were. Every other prop, and
 * any added later, wakes a waiting engine when it changes.
 *
 * @internal
 */
export const DISPLAY_ONLY_ROOT_PROPS = ['children'] as const;

/**
 * The same, for the root's `options`: appearance, layout, focus handling
 * and links, which the engine applies when it loads and the stand-in's
 * surfaces read at render.
 *
 * @internal
 */
export const DISPLAY_ONLY_OPTIONS = [
	'colorScheme',
	'components',
	'disableAnimation',
	'i18n',
	'legalLinks',
	'noStyle',
	'preloadDialog',
	'presentation',
	'scrollLock',
	'styles',
	'theme',
	'trapFocus',
] as const;

/** The root props {@link liveRootKey} reads: all of them. @internal */
export interface LiveRootInputs {
	/** The server's consent state: counted by identity and presence. */
	state?: unknown;
	options?: object;
}

/** `value` without the `display`-only fields. */
const withoutDisplay = (
	value: Readonly<Record<string, unknown>> | undefined,
	display: readonly string[]
): Record<string, unknown> => {
	const kept: Record<string, unknown> = {};
	for (const [name, field] of Object.entries(value ?? {})) {
		if (!display.includes(name)) {
			kept[name] = field;
		}
	}
	return kept;
};

/**
 * A key for a root's live options: every root prop and option except the
 * display-only ones ({@link DISPLAY_ONLY_ROOT_PROPS},
 * {@link DISPLAY_ONLY_OPTIONS}), with `state` by identity. A deferred
 * shell given a different key than at mount (`live` on
 * `DeferredConsentShell`) loads the engine at once. Every value is
 * serialized with sorted keys; a callback counts only by being there, so
 * an inline callback rebuilt each render keeps the key while adding or
 * removing one changes it (the shell reads the latest callbacks at a tap).
 * A `callbackOnly` predicate counts by identity, as the loader remounts a
 * script given a new one.
 * A value that cannot be serialized gives a new key each time, which loads
 * the engine.
 *
 * @param root - The root's merged props.
 * @returns The key.
 * @internal
 */
/**
 * An id per object or function, so a new or removed `state`, or a new
 * `callbackOnly` predicate, changes the key.
 */
const identities = new WeakMap<WeakKey, number>();
let lastIdentity = 0;
const identityOf = (value: unknown): unknown => {
	if (
		value === null ||
		(typeof value !== 'object' && typeof value !== 'function')
	) {
		return value ?? null;
	}
	let id = identities.get(value);
	if (id === undefined) {
		lastIdentity += 1;
		id = lastIdentity;
		identities.set(value, id);
	}
	return id;
};

export const liveRootKey = function liveRootKey(root: LiveRootInputs): string {
	const { options, state, ...rest } = root as LiveRootInputs &
		Record<string, unknown>;
	try {
		return JSON.stringify(
			[
				// A navigation that swaps the server's state, from a grant to a
				// denial or to none, no longer matches the snapshot at mount.
				identityOf(state),
				withoutDisplay(rest, DISPLAY_ONLY_ROOT_PROPS),
				withoutDisplay(
					options as Readonly<Record<string, unknown>> | undefined,
					DISPLAY_ONLY_OPTIONS
				),
			],
			(key, value: unknown) => {
				if (typeof value === 'function') {
					// The loader remounts a script given a new predicate.
					return key === 'callbackOnly' ? `ƒ${identityOf(value)}` : 'ƒ';
				}
				if (value instanceof RegExp) {
					return `${value}`;
				}
				if (value && typeof value === 'object' && !Array.isArray(value)) {
					const sorted: Record<string, unknown> = {};
					for (const name of Object.keys(value).sort()) {
						sorted[name] = (value as Record<string, unknown>)[name];
					}
					return sorted;
				}
				return value;
			}
		);
	} catch {
		return `${Math.random()}`;
	}
};

// The rule lives in core, where the server's stored-choice check reads it.
export { rootNeedsEngine } from '@inth/sdk/surface-actions/plain-scripts';
export type { RootEngineInputs } from '@inth/sdk/surface-actions/plain-scripts';

/**
 * Whether `@inth/react/iab` (`IABProvider`) has loaded. Its module marks a
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
			Symbol.for('inth.react.iab-provider')
		] === true
	);
};

/**
 * Runs `run` once `@inth/react/iab` has loaded: at once when it has,
 * or when its module evaluates, which may come after the root's chunk. The
 * registry key is the one `markIABProviderLoaded` drains.
 *
 * @param run - Runs once.
 * @internal
 */
export const whenIABProviderLoads = function whenIABProviderLoads(
	run: () => void
): void {
	if (iabProviderLoaded()) {
		run();
		return;
	}
	const host = globalThis as Record<symbol, (() => void)[] | undefined>;
	const key = Symbol.for('inth.react.iab-provider-waiters');
	host[key] = [...(host[key] ?? []), run];
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
		snapshot &&
		!canDeferEngine(snapshot) &&
		!startsScriptsWithoutEngine(snapshot)
	);
};
