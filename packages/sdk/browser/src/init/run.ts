/**
 * The init script (`inth.js`): the part of the script tag that runs before
 * the page's largest image has loaded.
 *
 * It installs a stand-in `window.inth`, starts `/init`, renders the stock
 * banner from the answer, records an accept or reject tapped on it, and
 * starts the scripts a stored or new choice allows. A Customize tap on its
 * banner opens the stock preference dialog from `inth.dialog.js` without
 * the engine. Then it loads the engine (`inth.hosted.js`) after the page's
 * priority images, at the first input, once a tapped choice is stored or
 * the dialog is on screen, or after `ENGINE_TIMEOUT_MS`, and hands it
 * everything through the boot object (`./boot.ts`).
 *
 * It runs nothing early it cannot run the way the engine would: any option
 * the engine reads differently (a theme, custom copy, an experiment, a
 * custom transport or storage) leaves that part to the engine, which then
 * loads at once.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot, KernelEvent, SaveResult } from '@inth/sdk-core';
import {
	configFromPrefetchedInit,
	hasStoredConsent,
	pendingSnapshot,
	primeInitRequest,
	snapshotFromPrefetchedInit,
} from '@inth/sdk-core/runtime/deferred-snapshot';
import type {
	DeferredSnapshotOptions,
	PrefetchedInitialData,
} from '@inth/sdk-core/runtime/deferred-snapshot';
import {
	generateSubjectId,
	hasStoredClearEpoch,
	planInstantCommit,
} from '@inth/sdk-core/surface-actions/instant-commit';
import {
	isPlainScript,
	isRunnableNow,
	startPlainScripts,
} from '@inth/sdk-core/surface-actions/plain-scripts';
import { prefersReducedMotion } from '@inth/sdk-ui/utils/reduced-motion';

import { mergeClientOptions, readPageOptions } from '../auto-init';
import { activateGatedScripts } from '../gated-scripts';
import { stylesheet } from '../generated/styles';
import type { InthGlobalBase, QueuedCall } from '../global-base';
import { GLOBAL_NAME } from '../global-name';
import { hasDecided } from '../has-decided';
import { ACTION_ATTRIBUTE, PREFERENCES_HASH } from '../page-actions';
import type { ConsentClient, ScriptTagClientOptions } from '../types';
import { createBanner } from '../ui/banner';
import type { BannerSurface } from '../ui/banner';
import { shareLocks } from '../ui/locks';
import { createUIRoot } from '../ui/root';
import { version } from '../version';
import { BOOT_KEY } from './boot';
import type {
	InitBoot,
	InitCommit,
	InitCommitPart,
	InitRecordsPart,
} from './boot';
import { hasBannerCopy } from './copy';
import { DIALOG_KEY } from './dialog-file';
import type { DialogFile } from './dialog-file';
import type { EarlyDialog, EarlyDialogHost } from './early-dialog';
import { supportsEarlyStart } from './eligibility';
import { hostedMarker, readHostedMarker } from './hosted-marker';
import { partSrc } from './part-src';
import type { InitFile } from './part-src';
import {
	clearPendingTap,
	readPendingTap,
	writePendingTap,
} from './pending-tap';
import type { PendingTap } from './pending-tap';
import { readPolicyCache, writePolicyCache } from './policy-cache';
import { scheduleEngine } from './schedule';

/**
 * How long the engine waits for the init script's `/init` answer, and the
 * init script for `inth.commit.js`, `inth.records.js` or `inth.dialog.js`.
 */
const INIT_WAIT_MS = 3000;

/** The waits before each retry of a failed `inth.hosted.js`. */
const ENGINE_RETRY_MS = [1000, 2000];

/** Calls that act on consent or the UI. They load the engine at once. */
const ACTIONS = [
	'save',
	'saveIAB',
	'dismissNotice',
	'showBanner',
	'openDialog',
	'closeDialog',
	'setLanguage',
	'identify',
	'mountUI',
	'processIframes',
] as const;

/** Methods that return a promise. */
const ASYNC = new Set<string>([
	'acceptAll',
	'rejectAll',
	'save',
	'saveIAB',
	'dismissNotice',
	'identify',
]);

/** `data-inth-action` values, as the engine's client routes them. */
const PAGE_ACTIONS: Record<string, string> = {
	accept: 'acceptAll',
	banner: 'showBanner',
	close: 'closeDialog',
	customize: 'openDialog',
	dismiss: 'dismissNotice',
	reject: 'rejectAll',
};

const notReady = (): Error =>
	new Error('@inth/sdk: call inth.init() first, or wait for inth.ready().');

/** A queued call whose result the caller waits for (see `runQueued`). */
type SettledCall = QueuedCall & {
	settle?: (result: unknown, failed?: boolean) => void;
};

/** Calls `callbacks` the way the engine's runtime calls them for `event`. */
const announce = function announce(
	callbacks: ScriptTagClientOptions['callbacks'],
	event: KernelEvent
): void {
	const { type, ...payload } = event;
	try {
		if (type === 'permissions:changed') {
			callbacks?.onPermissionsChanged?.(payload as never);
		} else if (type === 'choice:recorded') {
			callbacks?.onChoiceRecorded?.(payload as never);
		} else if (type === 'surface:shown') {
			callbacks?.onSurfaceShown?.(payload as never);
		}
	} catch (error) {
		// oxlint-disable-next-line no-console -- A page callback failed.
		console.error('[inth] A consent callback threw.', error);
	}
};

/**
 * Whether the engine's banner would look the same as the one the init
 * script renders: the stock banner in a shadow root, the stock sheet, no
 * theme, custom copy source or container.
 */
const supportsEarlyBanner = function supportsEarlyBanner(
	options: ScriptTagClientOptions
): boolean {
	const { ui } = options;
	return (
		ui !== false &&
		ui?.banner !== false &&
		!(
			options.i18n ||
			ui?.theme ||
			ui?.css ||
			ui?.stylesheetUrls?.length ||
			ui?.noStyle ||
			ui?.styles === false ||
			ui?.container !== undefined ||
			ui?.shadow === false
		)
	);
};

/**
 * Run the init script for `script`: install the stand-in `window.inth`,
 * start `/init` unless the page inits itself, and schedule the engine.
 *
 * @returns The stand-in, or `null` when `window.inth` is already an API.
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One lifecycle: stand in, start, hand over.
export const runInitScript = function runInitScript(
	script: HTMLScriptElement | null
): InthGlobalBase | null {
	const target = window as unknown as Record<string, unknown>;
	const existing = target[GLOBAL_NAME];
	if (existing && !Array.isArray(existing)) {
		// The engine or another init script is installed already.
		return null;
	}
	const queued = (existing ?? []) as unknown[];
	const { manual, options: scriptOptions } = readPageOptions(script);

	let api: InthGlobalBase | null = null;
	let options: ScriptTagClientOptions | null = null;
	let snapshot: ConsentSnapshot | null = null;
	let lastInit: PrefetchedInitialData | undefined;
	let banner: BannerSurface | null = null;
	/** The dialog opened before the engine, from `inth.dialog.js`. */
	let dialog: EarlyDialog | null = null;
	let dialogLoading = false;
	/** What the dialog closes back to before the engine. */
	let beforeDialog: ConsentSnapshot['activeUI'] = 'banner';
	let engineRequested = false;
	/** Set once `inth.hosted.js` failed on every try. */
	let engineError: Error | null = null;
	let ahead: { clearEpoch: boolean; subjectId: string } | undefined;
	let persist: (() => void) | null = null;
	const parts: { commit?: InitCommitPart; records?: InitRecordsPart } = {};
	const partLoads: Partial<Record<InitFile, Promise<unknown>>> = {};
	const configs: ScriptTagClientOptions[] = [];
	const listeners = new Set<(next: ConsentSnapshot) => void>();
	const cleanups: (() => void)[] = [];

	/** Keep the last `/init` policy once the visitor has a choice. */
	const cachePolicy = function cachePolicy(): void {
		const projectUrl =
			options?.projectUrl ?? readHostedMarker(options?.mode)?.projectUrl;
		if (lastInit && projectUrl) {
			writePolicyCache(projectUrl, options?.overrides, lastInit);
		}
	};
	const boot: InitBoot = {
		attach(engine) {
			api = engine;
			// The dialog on screen stays open: the engine opens it first, and
			// its UI takes this one over (`takeDialog`).
			if (dialog && snapshot?.activeUI === 'dialog') {
				boot.calls.unshift(['openDialog']);
			}
			// A choice still waiting for its write is stored before the engine
			// reads storage.
			persist?.();
			for (const cleanup of cleanups.splice(0)) {
				cleanup();
			}
			listeners.clear();
			// A choice the engine records also keeps the policy for the next
			// page's init script.
			engine.onInit((client) => {
				const off = client.subscribe((next) => {
					if (next.explicitChoice) {
						off();
						cachePolicy();
						// The engine recorded the tap the init script handed it.
						clearPendingTap();
					}
				});
			});
		},
		calls: [],
		commit: null,
		disposed: false,
		prefetch: null,
		provide(part) {
			// A file from another release may not match this script's data.
			if (part.version === version) {
				(parts as Record<string, unknown>)[part.name] = part;
			}
		},
		script,
		settled: null,
		ui: null,
		version,
	};

	const fileSrc = (file: InitFile): string | null =>
		partSrc(file, script, script?.getAttribute('src'));

	const appendScript = function appendScript(src: string): HTMLScriptElement {
		const element = document.createElement('script');
		element.src = src;
		const nonce = options?.nonce ?? scriptOptions.nonce;
		if (nonce) {
			element.nonce = nonce;
		}
		document.head.append(element);
		return element;
	};

	const loadEngine = function loadEngine(): void {
		if (engineRequested || api || boot.disposed) {
			return;
		}
		engineRequested = true;
		const src = fileSrc('hosted');
		if (!src) {
			// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
			console.error(
				'@inth/sdk: inth.js cannot tell where inth.hosted.js is. Load inth.js from a URL, or set data-hosted-src.'
			);
			return;
		}
		let tries = 0;
		const request = () => {
			const element = appendScript(src);
			element.addEventListener('error', () => {
				element.remove();
				if (api) {
					return;
				}
				if (boot.disposed) {
					// A later `init()` requests it again.
					engineRequested = false;
					return;
				}
				const wait = ENGINE_RETRY_MS[tries];
				tries += 1;
				if (wait !== undefined) {
					// The same URL: the browser fetches it again unless the
					// failure came with cache headers, as a missing file's may.
					setTimeout(() => {
						if (boot.disposed) {
							engineRequested = false;
						} else if (!api) {
							request();
						}
					}, wait);
					return;
				}
				engineError = new Error(
					`@inth/sdk: inth.hosted.js failed to load ${tries} times, from ${src}.`
				);
				// oxlint-disable-next-line no-console -- The engine is not coming.
				console.error(engineError.message);
				for (const call of boot.calls.splice(0) as SettledCall[]) {
					call.settle?.(engineError, true);
				}
			});
		};
		request();
	};

	/**
	 * Fetch `inth.commit.js`, `inth.records.js` or `inth.dialog.js`, once.
	 * Settles when it has run, failed, or after {@link INIT_WAIT_MS}; `parts`
	 * or the dialog global holds what it provided.
	 */
	const loadPart = function loadPart(
		file: Exclude<InitFile, 'hosted'>
	): Promise<unknown> {
		// oxlint-disable-next-line promise/avoid-new -- Settled by the script element.
		partLoads[file] ??= new Promise((resolve) => {
			const src = fileSrc(file);
			if (!src || api) {
				resolve(null);
				return;
			}
			const element = appendScript(src);
			element.addEventListener('load', resolve);
			element.addEventListener('error', resolve);
			setTimeout(resolve, INIT_WAIT_MS);
		});
		return partLoads[file];
	};

	const queue = function queue(call: SettledCall): void {
		if (engineError) {
			call.settle?.(engineError, true);
		} else {
			boot.calls.push(call);
		}
	};

	/**
	 * Queue a call for the engine and load it now. A method that returns a
	 * promise resolves with the engine's result.
	 */
	const act = function act(method: string, args: unknown[]): unknown {
		if (api) {
			return (
				api as unknown as Record<string, (...rest: unknown[]) => unknown>
			)[method]?.(...args);
		}
		const call: SettledCall = [method, ...args];
		let result: Promise<unknown> | undefined;
		if (ASYNC.has(method)) {
			// oxlint-disable-next-line promise/avoid-new -- Settled by the engine's queue.
			result = new Promise((resolve, reject) => {
				call.settle = (value, failed) =>
					failed ? reject(value) : resolve(value);
			});
		}
		queue(call);
		loadEngine();
		return result;
	};

	const setSnapshot = function setSnapshot(next: ConsentSnapshot): void {
		snapshot = next;
		banner?.sync(next);
		dialog?.surface.sync(next);
		for (const listener of listeners) {
			try {
				listener(next);
			} catch (error) {
				// oxlint-disable-next-line no-console -- A page listener failed.
				console.error('@inth/sdk: a subscribe listener threw.', error);
			}
		}
	};

	/**
	 * Show `surface` from `next`: the snapshot the page reads, with the
	 * surface's first impression stamped now, as the engine's kernel stamps
	 * one it paints. The stamp times an early choice's save, and the engine
	 * starts from it instead of stamping its own when it attaches, so the
	 * impression is announced once, here.
	 */
	const showSurface = function showSurface(
		next: ConsentSnapshot,
		surface: 'banner' | 'dialog'
	): void {
		const at = Date.now();
		const shown =
			next.surfaceShownAt[surface] === null
				? {
						...next,
						surfaceShownAt: { ...next.surfaceShownAt, [surface]: at },
					}
				: next;
		setSnapshot(shown);
		if (boot.prefetch) {
			boot.prefetch.config = {
				...boot.prefetch.config,
				initialSurfaceShownAt: shown.surfaceShownAt,
			};
		}
		announce(options?.callbacks, {
			shownAt: at,
			snapshot: shown,
			surface,
			type: 'surface:shown',
		});
	};

	/**
	 * Start what `next` allows: the page's plain `scripts` and its inert
	 * `data-inth-category` tags. A non-plain script that may run needs the
	 * engine's loader, which then loads at once.
	 */
	const startScripts = function startScripts(next: ConsentSnapshot): void {
		const current = options ?? scriptOptions;
		const scripts = current.scripts ?? [];
		startPlainScripts(scripts, next, current.nonce);
		if (
			scripts.some(
				(entry) => isRunnableNow(entry, next) && !isPlainScript(entry)
			)
		) {
			loadEngine();
		}
		// A tag naming a vendor counts a denial only once the engine has
		// declared the vendor, so a visitor with denials waits for it.
		if (next.vendorChoice?.denied.length) {
			return;
		}
		const scan = () => {
			if (!api) {
				activateGatedScripts(
					next,
					document,
					current.nonce ? { nonce: current.nonce } : {}
				);
			}
		};
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', scan, { once: true });
		}
		scan();
	};

	/** Whether an accept or reject now can be recorded without the engine. */
	const canTapEarly = (): boolean =>
		Boolean(
			!api && snapshot && ahead && !ahead.clearEpoch && !boot.commit && options
		);

	/**
	 * Records an accept, a reject or a save of category choices from the
	 * dialog without the engine, when it can.
	 */
	const tap = function tap(choice: PendingTap['c']): unknown {
		const [method, ...args]: QueuedCall =
			typeof choice === 'object'
				? ['save', choice]
				: [choice === 'all' ? 'acceptAll' : 'rejectAll'];
		if (api) {
			return act(method, args);
		}
		const actionAt = Date.now();
		const plan =
			snapshot && ahead && canTapEarly()
				? planInstantCommit({
						actionAt,
						choice,
						snapshot,
						subjectId: ahead.subjectId,
					})
				: null;
		if (!(plan && options)) {
			return act(method, args);
		}
		const current = options;
		const commit: InitCommit = { queued: null, snapshot: plan.snapshot };
		boot.commit = commit;
		// Kept until the choice is stored, so a visitor who leaves before
		// `inth.commit.js` arrives still has it recorded on the next page.
		writePendingTap(choice, plan.previous, actionAt);
		setSnapshot(plan.snapshot);
		startScripts(plan.snapshot);
		cachePolicy();
		const chunk = loadPart('commit');
		// An engine that arrives first waits for the file, so it starts from
		// the stored record, but not for long.
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		boot.settled = Promise.all([boot.settled, chunk]).then(() => undefined);
		// oxlint-disable-next-line promise/avoid-new -- Settled by the write below.
		return new Promise<SaveResult>((resolve) => {
			// The record is written in a task after the tap, once
			// `inth.commit.js` has run, so the tap's own task only hides the
			// banner and starts the scripts. An engine that takes over sooner
			// flushes it first, or records the tap itself without the file.
			persist = () => {
				persist = null;
				const module = parts.commit;
				const early =
					!module || hasStoredClearEpoch()
						? null
						: module.planEarlyCommit({
								actionAt,
								choice,
								now: plan.now,
								snapshot: plan.previous,
								subjectId: plan.subjectId,
							});
				if (!(module && early)) {
					// The engine records it instead.
					queue([method, ...args]);
					loadEngine();
					resolve({ ok: false });
					return;
				}
				const stored = module.storeEarlyCommit(early);
				clearPendingTap();
				// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
				commit.queued = stored.catch(() => false);
				void (async () => {
					const queuedSave = await stored.catch(() => false);
					if (queuedSave) {
						// The callbacks hear a choice once it is recorded.
						for (const event of early.events) {
							announce(current.callbacks, event);
						}
					} else {
						// The record is stored, but the outbox could not keep its
						// save: the engine records the tap itself, so the backend
						// still gets it, and its callbacks announce it.
						queue([method, ...args]);
					}
					loadEngine();
					resolve({
						confirmed: Object.keys(
							early.payload.confirmed.categories
						) as SaveResult['confirmed'],
						ok: true,
						subjectId: early.payload.subjectId,
					});
				})();
			};
			// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
			void chunk.then(() => {
				setTimeout(() => persist?.(), 0);
			});
		});
	};

	/** Whether a Customize tap now can open the dialog without the engine. */
	const canOpenEarly = function canOpenEarly(): boolean {
		const ui = options?.ui || undefined;
		return Boolean(
			!api &&
			boot.ui &&
			snapshot &&
			!snapshot.policyPending &&
			!boot.commit &&
			ui?.dialog !== false &&
			snapshot.policyRule.model !== 'iab'
		);
	};

	/**
	 * Fetch `inth.dialog.js`, once. Settles with what it published, or
	 * `undefined` when it failed, came from another release, or took longer
	 * than {@link INIT_WAIT_MS}.
	 */
	const loadDialog = function loadDialog(): Promise<DialogFile | undefined> {
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		return loadPart('dialog').then(() => {
			const file = target[DIALOG_KEY] as DialogFile | undefined;
			// A file from another release may not match this script's markup.
			return file?.version === version ? file : undefined;
		});
	};

	/**
	 * Saves the dialog's categories without the engine, when it can, as an
	 * accept is recorded. A save that moves a vendor waits for the engine,
	 * which declares the vendors.
	 */
	const saveFromDialog = function saveFromDialog(
		input: Record<string, unknown>
	): unknown {
		const { vendors, ...categories } = input;
		if (api || (vendors && Object.keys(vendors).length)) {
			return act('save', [input]);
		}
		return tap(categories as Record<string, boolean>);
	};

	/** Closes the dialog opened before the engine, back to the banner. */
	const closeDialog = function closeDialog(): unknown {
		if (api || !dialog || snapshot?.activeUI !== 'dialog') {
			return act('closeDialog', []);
		}
		const restored = { ...snapshot, activeUI: beforeDialog };
		if (beforeDialog === 'banner') {
			showSurface(restored, 'banner');
		} else {
			setSnapshot(restored);
		}
		return undefined;
	};

	/** Render the dialog from `file` over the banner. */
	const showDialog = function showDialog(file: DialogFile): void {
		const { ui } = boot;
		const current = options;
		const shown = snapshot;
		if (!(ui && current && shown)) {
			return;
		}
		shareLocks();
		dialog ??= file.openEarlyDialog({
			closeDialog,
			options: current,
			presentation: () => api?.client?.presentation ?? current.presentation,
			save: saveFromDialog,
			// `window.inth`, this stand-in: once the engine has taken over, it
			// forwards every call there.
			standIn: target[GLOBAL_NAME] as EarlyDialogHost['standIn'],
			ui,
		});
		beforeDialog = shown.activeUI;
		showSurface({ ...shown, activeUI: 'dialog' }, 'dialog');
		// Once the dialog is on screen: the commit file, for a choice made
		// in it, and the engine.
		requestAnimationFrame(() => {
			setTimeout(() => {
				void loadPart('commit');
				loadEngine();
			}, 0);
		});
	};

	/**
	 * Opens the preference dialog: from `inth.dialog.js` before the engine
	 * when it can, else through the engine, which then loads at once, as it
	 * does when the file fails to load.
	 */
	const openDialog = function openDialog(): unknown {
		if (!canOpenEarly()) {
			return act('openDialog', []);
		}
		if (dialogLoading || snapshot?.activeUI === 'dialog') {
			return undefined;
		}
		dialogLoading = true;
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		void loadDialog().then((file) => {
			dialogLoading = false;
			if (file && canOpenEarly()) {
				showDialog(file);
			} else {
				act('openDialog', []);
			}
		});
		return undefined;
	};

	const renderBanner = function renderBanner(next: ConsentSnapshot): void {
		const current = options;
		if (!current || api || banner || !document.body) {
			return;
		}
		const ui = current.ui === false ? {} : (current.ui ?? {});
		const root = createUIRoot(document.body, ui, stylesheet, current.nonce);
		const client = {
			acceptAll: () => tap('all'),
			dismissNotice: () => act('dismissNotice', []),
			openDialog,
			presentation: current.presentation,
			rejectAll: () => tap('none'),
		} as unknown as ConsentClient;
		banner = createBanner(
			{
				client,
				disableAnimation: ui.disableAnimation ?? prefersReducedMotion(),
				legalLinks: current.legalLinks,
				noStyle: false,
				root: root.themeRoot,
				slot: (element) => element,
			},
			typeof ui.banner === 'object' ? ui.banner : {}
		);
		boot.ui = {
			...root,
			takeBanner() {
				const handed = banner?.handoff() ?? null;
				banner = null;
				return handed;
			},
			takeDialog() {
				const early = dialog;
				const rendered = snapshot;
				dialog = null;
				if (!early) {
					return null;
				}
				if (rendered?.activeUI !== 'dialog') {
					early.surface.destroy();
					return null;
				}
				return {
					adopt: (engine) => early.handOver(rendered, engine),
					destroy: () => early.surface.destroy(),
				};
			},
		};
		ahead = {
			clearEpoch: hasStoredClearEpoch(),
			subjectId: generateSubjectId(),
		};
		showSurface(next, 'banner');
	};

	/** Start `/init` and everything that follows from its answer. */
	const begin = function begin(initOptions?: ScriptTagClientOptions): void {
		if (options) {
			return;
		}
		const current = [...configs, initOptions ?? {}].reduce(
			mergeClientOptions,
			scriptOptions
		);
		options = current;
		const hosted = readHostedMarker(current.mode);
		const projectUrl = current.projectUrl ?? hosted?.projectUrl;
		const gpc =
			(navigator as Navigator & { globalPrivacyControl?: boolean })
				.globalPrivacyControl === true;
		const snapshotOptions: DeferredSnapshotOptions = {
			consentCategories: current.consentCategories,
			gpc,
			overrides: current.overrides,
		};
		snapshot = pendingSnapshot(snapshotOptions);
		let pending: Promise<PrefetchedInitialData | undefined> | undefined;
		if (supportsEarlyStart(current, projectUrl)) {
			try {
				pending = primeInitRequest({
					overrides: current.overrides,
					projectUrl,
				});
			} catch {
				pending = undefined;
			}
		}
		if (!(pending && projectUrl)) {
			// Nothing to show or start without the engine: load it now, as a
			// one-file script tag would.
			loadEngine();
			return;
		}
		const stored = hasStoredConsent();
		// A tap a previous page showed but could not store: the engine
		// records it, so this page shows no early banner.
		const pendingTap = readPendingTap();
		let answered = false;
		const markAnswered = () => {
			answered = true;
		};
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		void pending.then(markAnswered, markAnswered);
		// A returning visitor: `inth.records.js`, the record reader, loads at
		// once. The choice they stored, evaluated against the policy the last
		// `/init` sent, starts its scripts as soon as it has run, unless
		// `/init` answered first. Settles `false` when it did not run.
		const records = stored
			? // oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
				loadPart('records').then(() => {
					const reader = parts.records;
					if (!reader) {
						return false;
					}
					const read = reader.readStoredRecords(undefined, Date.now());
					if (read.found) {
						snapshotOptions.records = read.records;
						const cached =
							answered || api
								? undefined
								: snapshotFromPrefetchedInit(
										readPolicyCache(projectUrl, current.overrides),
										snapshotOptions
									);
						if (cached) {
							setSnapshot(cached);
							startScripts(cached);
						}
					}
					return true;
				})
			: true;
		// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
		const handled = Promise.all([pending, records]).then(([data, readable]) => {
			if (api || boot.commit || boot.disposed) {
				return;
			}
			lastInit = data;
			if (!readable) {
				// A stored choice the init script could not read: the engine
				// decides, now.
				loadEngine();
				return;
			}
			const resolved = snapshotFromPrefetchedInit(data, snapshotOptions);
			if (!(data && resolved)) {
				// A response the init script cannot read, or none: the engine
				// decides, now.
				loadEngine();
				return;
			}
			const config = configFromPrefetchedInit(data, current.overrides);
			if (config) {
				boot.prefetch = { config, overrides: current.overrides, projectUrl };
			}
			if (stored) {
				writePolicyCache(projectUrl, current.overrides, data);
			}
			setSnapshot(resolved);
			startScripts(resolved);
			if (resolved.activeUI !== 'banner') {
				return;
			}
			if (
				pendingTap ||
				!supportsEarlyBanner(current) ||
				!hasBannerCopy(resolved)
			) {
				loadEngine();
				return;
			}
			if (document.body) {
				renderBanner(resolved);
			} else {
				document.addEventListener(
					'DOMContentLoaded',
					() => {
						if (snapshot === resolved) {
							renderBanner(resolved);
						}
					},
					{ once: true }
				);
			}
		});
		// The engine waits for this before it takes over, so it starts from
		// the answer instead of sending /init again, but not for long.
		boot.settled = Promise.race([
			// oxlint-disable-next-line promise/prefer-await-to-then -- Not in an async function.
			handled.catch(() => undefined),
			// oxlint-disable-next-line promise/avoid-new -- A timer as a promise.
			new Promise<void>((resolve) => {
				setTimeout(resolve, INIT_WAIT_MS);
			}),
		]);
	};

	const onPageClick = function onPageClick(event: MouseEvent): void {
		const element = event.target instanceof Element ? event.target : null;
		const named = element
			?.closest(`[${ACTION_ATTRIBUTE}]`)
			?.getAttribute(ACTION_ATTRIBUTE);
		const action =
			(named && PAGE_ACTIONS[named]) ||
			(element
				?.closest('a[href]')
				?.getAttribute('href')
				?.endsWith(PREFERENCES_HASH)
				? 'openDialog'
				: null);
		if (!action) {
			return;
		}
		event.preventDefault();
		if (action === 'acceptAll' || action === 'rejectAll') {
			void tap(action === 'acceptAll' ? 'all' : 'none');
		} else if (action === 'openDialog') {
			void openDialog();
		} else {
			void act(action, []);
		}
	};
	document.addEventListener('click', onPageClick);
	cleanups.push(() => document.removeEventListener('click', onPageClick));

	/** With `failable`, rejects when the engine fails to load. */
	const withClient = function withClient<Result>(
		run: (client: ConsentClient) => Result,
		failable = false
	): Promise<Result> {
		// oxlint-disable-next-line promise/avoid-new -- Settled from the engine's onInit.
		return new Promise((resolve, reject) => {
			const call: SettledCall = [
				'onInit',
				(client: ConsentClient) => {
					try {
						resolve(run(client));
					} catch (error) {
						reject(error);
					}
				},
			];
			if (failable) {
				call.settle = (error, failed) => {
					if (failed) {
						reject(error);
					}
				};
			}
			queue(call);
		});
	};

	const forward = (method: string, args: unknown[]) =>
		(api as unknown as Record<string, (...rest: unknown[]) => unknown>)[
			method
		]?.(...args);

	const readSnapshot = function readSnapshot(): ConsentSnapshot {
		if (!snapshot) {
			throw notReady();
		}
		return snapshot;
	};

	const standIn = {
		[BOOT_KEY]: boot,
		acceptAll: () => tap('all'),
		get client() {
			return api?.client ?? null;
		},
		config(config: ScriptTagClientOptions) {
			if (api) {
				return api.config(config);
			}
			configs.push(config);
			queue(['config', config]);
		},
		get devtools() {
			return api?.devtools ?? null;
		},
		set devtools(value) {
			if (api) {
				api.devtools = value;
			}
		},
		dispose() {
			if (api) {
				return api.dispose();
			}
			boot.calls.length = 0;
			banner?.destroy();
			banner = null;
			dialog?.surface.destroy();
			dialog = null;
			boot.ui?.releaseScheme();
			boot.ui?.host.remove();
			boot.ui = null;
			options = null;
			snapshot = null;
			// No later input, image load or timer loads the engine, and an
			// engine already on its way installs itself without initialising
			// (`autoInit`). A `/init` answer still in flight renders nothing.
			boot.disposed = true;
			for (const cleanup of cleanups.splice(0)) {
				cleanup();
			}
			listeners.clear();
		},
		getDeclaredVendors: () => (api ? api.getDeclaredVendors() : []),
		getSnapshot: () => (api ? api.getSnapshot() : readSnapshot()),
		getVendorChoice: () =>
			api ? api.getVendorChoice() : readSnapshot().vendorChoice,
		has: (condition: Parameters<ConsentClient['has']>[0]) =>
			api
				? api.has(condition)
				: isRunnableNow({ category: condition }, readSnapshot()),
		hasConsented: () => (api ? api.hasConsented() : hasDecided(readSnapshot())),
		hosted: hostedMarker,
		get hosting() {
			return api?.hosting ?? null;
		},
		init(initOptions?: ScriptTagClientOptions) {
			if (api) {
				return api.init(initOptions);
			}
			queue(initOptions ? ['init', initOptions] : ['init']);
			if (boot.disposed) {
				// The listeners that would load the engine are gone: the engine
				// initialises from the queued call as soon as it arrives.
				boot.disposed = false;
				loadEngine();
				return standIn;
			}
			begin(initOptions);
			return standIn;
		},
		isVendorAllowed(vendorId: string) {
			if (!api) {
				throw new Error(
					'@inth/sdk: isVendorAllowed() needs inth.hosted.js. Call it from inth.onInit().'
				);
			}
			return api.isVendorAllowed(vendorId);
		},
		get mode() {
			return api?.mode ?? null;
		},
		on(event: string, listener: (payload: unknown) => void) {
			if (api) {
				return forward('on', [event, listener]);
			}
			let active = true;
			let off: (() => void) | undefined;
			void withClient((client) => {
				if (active) {
					off = client.on(event as never, listener as never);
				}
			});
			return () => {
				active = false;
				off?.();
			};
		},
		onInit(listener: (client: ConsentClient) => void) {
			if (api) {
				return api.onInit(listener);
			}
			let active = true;
			void withClient((client) => {
				if (active) {
					listener(client);
				}
			});
			return () => {
				active = false;
			};
		},
		pkg: '@inth/sdk',
		provideGPP(module: Parameters<InthGlobalBase['provideGPP']>[0]) {
			if (api) {
				return api.provideGPP(module);
			}
			queue(['provideGPP', module]);
		},
		push(...calls: unknown[]) {
			if (api) {
				return api.push(...calls);
			}
			for (const call of calls) {
				const [method, ...args] = Array.isArray(call) ? call : [];
				const own = (standIn as Record<string, unknown>)[method as string];
				if (typeof method === 'string' && typeof own === 'function') {
					(own as (...rest: unknown[]) => unknown).apply(standIn, args);
				} else {
					queue(call as QueuedCall);
				}
			}
			return calls.length;
		},
		ready: () =>
			api ? api.ready() : withClient((client) => client.ready(), true),
		rejectAll: () => tap('none'),
		subscribe(listener: (next: ConsentSnapshot) => void) {
			if (api) {
				return api.subscribe(listener);
			}
			listeners.add(listener);
			let active = true;
			let off: (() => void) | undefined;
			void withClient((client) => {
				listeners.delete(listener);
				if (active) {
					off = client.subscribe(listener);
				}
			});
			return () => {
				active = false;
				listeners.delete(listener);
				off?.();
			};
		},
		version,
	};
	for (const method of ACTIONS) {
		(standIn as Record<string, unknown>)[method] = (...args: unknown[]) =>
			act(method, args);
	}
	Object.assign(standIn, { closeDialog, openDialog });
	target[GLOBAL_NAME] = standIn;

	// Calls queued on the array before this tag, in order.
	for (const call of queued) {
		standIn.push(call);
	}
	if (!manual) {
		begin();
	}
	/**
	 * The action an input lands on: a `data-inth-action` button, or a stock
	 * button in the init script's UI. `onUI` is whether it lands in that UI.
	 */
	const pressed = function pressed(event: Event): {
		action: string | null;
		onUI: boolean;
	} {
		const path = event.composedPath();
		const onUI = Boolean(boot.ui && path.includes(boot.ui.host));
		for (const node of path) {
			const action =
				node instanceof Element
					? (node.getAttribute(ACTION_ATTRIBUTE) ??
						(onUI ? node.getAttribute('data-action') : null))
					: null;
			if (action) {
				return { action, onUI };
			}
		}
		return { action: null, onUI };
	};

	/**
	 * A press fetches what its tap needs, so it has usually run by the time
	 * the click lands: `inth.dialog.js` for Customize, `inth.commit.js` for
	 * anything else in the init script's UI.
	 */
	const onPress = function onPress(event: Event): void {
		const { action, onUI } = pressed(event);
		if (action === 'customize') {
			if (canOpenEarly()) {
				void loadDialog();
			}
		} else if (onUI) {
			// Never rejects; the tap reads what it provided.
			void loadPart('commit');
		}
	};
	document.addEventListener('pointerdown', onPress, true);
	cleanups.push(() =>
		document.removeEventListener('pointerdown', onPress, true)
	);

	/**
	 * A press on an accept or reject the init script will record itself, or
	 * on a Customize it will open the dialog for, on the stock banner or a
	 * `data-inth-action` button. The engine (`inth.hosted.js`) then starts
	 * once the choice is stored or the dialog is on screen instead of with
	 * the press, so the gated scripts the tap starts, `inth.commit.js` and
	 * `inth.dialog.js` do not share the connection with it. Any other press
	 * loads the engine at once.
	 */
	const holdsEngine = function holdsEngine(event: Event): boolean {
		if (event.type === 'scroll') {
			return false;
		}
		const { action } = pressed(event);
		return (
			((action === 'accept' || action === 'reject') && canTapEarly()) ||
			(action === 'customize' && canOpenEarly())
		);
	};
	cleanups.push(scheduleEngine(loadEngine, holdsEngine));
	return standIn as unknown as InthGlobalBase;
};
