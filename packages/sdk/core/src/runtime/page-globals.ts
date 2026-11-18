/**
 * The names inline scripts, the runtime and the framework adapters share
 * on `window` and on the script elements they insert. Constants only, so
 * a first-load chunk can import them without the inline scripts' text.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * The one page global the inline scripts a server render leaves for a
 * deferred root write: `{ id, starts, current?, failed? }`, for the render
 * whose boot data carries the same `id`.
 *
 * - `starts`: the resource key (`resourceKey ?? id`) of each script the
 *   server start emits, marked as the page parses. A deferred root counts
 *   a `serverStart` entry as started only when it is marked here.
 * - `current`: from the stored-choice check, a function that runs the
 *   check again and returns `true` while the browser's records still agree
 *   with the state the server read.
 * - `failed`: set when a marked script's setup, or the shared prelude,
 *   throws in the browser and inserts nothing.
 *
 * The first script of a render replaces the whole object, so nothing from
 * an earlier render in the same document, after a client-side navigation
 * or a remount, survives into this one; a later script of the same render
 * joins it. A root reads it only when its `id` matches its own boot data.
 *
 * @internal
 */
export const PAGE_RENDER_KEY = '__inthRender';

/**
 * The ids of the renders a deferred root ended (`endPageRender` in
 * `@inth/react`), newest last, at most {@link ENDED_RENDERS_LIMIT}. Kept
 * apart from {@link PAGE_RENDER_KEY}, which a newer render replaces, so a
 * render's start script that streams in late still finds it ended.
 *
 * @internal
 */
export const ENDED_RENDERS_KEY = '__inthEndedRenders';

/**
 * How many ended render ids {@link ENDED_RENDERS_KEY} keeps. An evicted id
 * would let that render's late start run, so the bound is far above the
 * renders one page sees; it only stops a page that never reloads from
 * growing the list without end. @internal
 */
export const ENDED_RENDERS_LIMIT = 1000;

/**
 * Event the server start dispatches on `window` when a marked script's
 * setup, or the shared prelude, throws: a deferred root that hears it
 * loads the engine at once. @internal
 */
export const SERVER_START_FAILED_EVENT = '__inthServerStartFailed';

/** A new id for one server render's inline scripts and boot data. @internal */
export const newRenderId = (): string =>
	Math.random().toString(36).slice(2, 10);

/**
 * The registry of script elements started before the loader mounted, by
 * the server start or by `startPlainScripts`, keyed like the loader's
 * element id by `resourceKey ?? id`. The loader adopts them. @internal
 */
export const STARTED_KEY = '__inthStarted';

/**
 * Set once a script loader mounted in the document: server-start code
 * that has not run yet leaves its scripts to the loader. @internal
 */
export const LOADER_RAN_KEY = '__inthLoaderRan';

/**
 * A script element in the {@link STARTED_KEY} registry.
 *
 * @internal
 */
export type StartedElement = HTMLScriptElement & {
	/** A loader took it over. */
	__inthAdopted?: boolean;
	/** Whether its setup ran with consent. */
	__inthConsent?: boolean;
	/** A hash of what the server start set up for it. */
	__inthDeclaration?: string;
	/** Set once the element loaded or failed. */
	__inthDone?: 'load' | 'error';
	/** Inserted by `startPlainScripts`, so its owners may release it. */
	__inthEarly?: boolean;
	/**
	 * Set when the stored consent changed while the insert waited: its setup
	 * ran, and only a loader that runs the script inserts it.
	 */
	__inthHeld?: boolean;
	/**
	 * The pending insert while it waits for the page's priority images;
	 * deleting it cancels the insert.
	 */
	__inthInsert?: () => void;
	/** How many owners declare it (`claimPlainScripts`). */
	__inthOwners?: number;
	/**
	 * What `startPlainScripts` inserted it for: its script's declaration
	 * without its identity.
	 */
	__inthPlainDeclaration?: string;
	/** The id of the script whose setup ran. */
	__inthScript?: string;
	/** The server render whose start inserted it, or took it over last. */
	__inthStartRender?: string;
};

/**
 * The page's {@link STARTED_KEY} registry, when anything started.
 *
 * @internal
 */
export const startedElements = (): Record<string, StartedElement> | undefined =>
	(globalThis as Record<string, unknown>)[STARTED_KEY] as
		| Record<string, StartedElement>
		| undefined;

/** One tap the early-tap script recorded. @internal */
export interface EarlyConsentTap {
	action: 'accept' | 'reject' | 'dismiss' | 'customize';
	/** Epoch milliseconds of the click. */
	at: number;
	/** The banner root's `data-model` when it was tapped. */
	model: string | null;
	/** The banner root's `data-prompt` when it was tapped. */
	prompt: string | null;
}

/** What the early-tap script leaves on `window`. @internal */
export interface EarlyConsentTapQueue {
	taps?: EarlyConsentTap[];
	stop?: () => void;
	/**
	 * Set by a deferred root ({@link EARLY_TAP_NOTIFY_KEY}): called after
	 * each recorded tap, so the root records it without waiting for the
	 * banner to hydrate.
	 */
	n?: () => void;
	/**
	 * Set by a deferred root ({@link EARLY_TAP_HOLD_PRESSES_KEY}) while its
	 * banner cannot hydrate: presses on the banner's buttons stop at the
	 * script.
	 */
	b?: number;
}

/** Window property the early-tap script and the runtime share. @internal */
export const EARLY_TAPS_WINDOW_KEY = '__inthEarlyTaps';

/**
 * Property of {@link EarlyConsentTapQueue} the script calls after it
 * records a tap. @internal
 */
export const EARLY_TAP_NOTIFY_KEY = 'n';

/**
 * Property of {@link EarlyConsentTapQueue} that, while truthy, makes the
 * script stop presses on the banner's buttons. @internal
 */
export const EARLY_TAP_HOLD_PRESSES_KEY = 'b';

/** Id of the `<style>` that hides the banner after a tap. @internal */
export const EARLY_TAP_STYLE_ID = 'inth-early-tap';

/** The stock banner's root. @internal */
export const EARLY_TAP_ROOT = '[data-testid="consent-banner-root"]';

/**
 * The early-tap queue, when the banner's inline script ran.
 *
 * @internal
 */
export const earlyTapQueue = (): EarlyConsentTapQueue | undefined =>
	(globalThis as Record<string, unknown>)[EARLY_TAPS_WINDOW_KEY] as
		| EarlyConsentTapQueue
		| undefined;

/**
 * Window property where `buildPrefetchScript()` stores its in-flight init
 * requests. @internal
 */
export const PREFETCH_WINDOW_KEY = '__inthInitialDataPromises';

/**
 * The listeners script-loader debug events go to: a `Set` of functions.
 * @internal
 */
export const SCRIPT_DEBUG_LISTENERS_KEY = '__inthScriptDebugListeners';
