import {
	applyExperimentAssignment,
	applyExperimentTheme,
	evaluateConsent,
	declareOwnedVendors,
	forgetOwnedVendors,
	IABUnavailableError,
	isVendorAllowed,
	resolveOptOut,
	resolveOptOutLink,
} from '@inth/sdk-core';
import type {
	AllConsentNames,
	ConsentPresentation,
	ConsentSnapshot,
	HasCondition,
	KernelActiveUI,
	KernelOverrides,
	KernelUser,
	OptOutResult,
	OptOutState,
	SaveResult,
	SaveInput,
	ProviderTransportFactory,
	ResolvedVendor,
} from '@inth/sdk-core';
import { isIABConfigured } from '@inth/sdk-core/runtime';
import type {
	ConsentRuntimeIABFactory,
	GPPModuleLoader,
	RuntimeGPPOptions,
} from '@inth/sdk-core/runtime';
import {
	activateOptOutLink,
	getOptOutReceiptData,
	optOutConsentSurface,
	saveConsentSurface,
	saveConsentSurfaceWithOptInCheck,
	saveIABConsentSurface,
	showConsentSurface,
	subscribeOptOutReceiptData,
} from '@inth/sdk-core/surface-actions';
import { hosted } from '@inth/sdk-core/transports';
import type { Theme } from '@inth/sdk-ui/theme';

import { createBrowserRuntime } from './create-runtime';
import { createDeferred } from './create-deferred';
import type { PublishDevToolsLauncher } from './create-browser-dev-tools';
import { createGatedScriptActivator } from './activate-gated-scripts';
import { hasDecided } from './has-decided';
import { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './page-actions.model';
import type {
	ConsentClient,
	ConsentClientEventMap,
	ScriptTagClientOptions,
	ConsentModeName,
	ConsentSaveInput,
	ConsentUIHandle,
	ConsentUIMounter,
	ConsentUIOptions,
} from './consent-client.model';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from './ui/opt-out-confirmation-state';

export { ACTION_ATTRIBUTE, PREFERENCES_HASH } from './page-actions.model';

/** Values `data-inth-action` accepts. */
export type PageAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'opt-out'
	| 'dismiss'
	| 'close'
	| 'banner';

const PAGE_ACTIONS: ReadonlySet<string> = new Set<PageAction>([
	'accept',
	'reject',
	'customize',
	'opt-out',
	'close',
	'dismiss',
	'banner',
]);

/** Extra wiring the entry points hand to the client. */
export interface CreateConsentClientContext {
	/** Install entry-specific globals before runtime initialization. */
	onStart?: (options: ScriptTagClientOptions) => () => void;
	/** Optional CMP factory supplied exclusively by the IAB entry. */
	createIAB?: ConsentRuntimeIABFactory;
	/** Loads `@inth/sdk/iab/gpp`. Only the script-tag global supplies it. */
	loadGPP?: GPPModuleLoader;
	/** The `gpp` option when the page sets none. Off unless an entry sets it. */
	defaultGPP?: RuntimeGPPOptions | boolean;
	/** Mounts the prebuilt UI. Absent in the headless build. */
	mountUI?: ConsentUIMounter;
	/**
	 * The launcher slot the prebuilt UI's trigger reads. Only the
	 * script-tag global uses it; see `GlobalApiBase.publishDevToolsLauncher`.
	 */
	publishDevToolsLauncher?: PublishDevToolsLauncher;
	/** Package name reported on `window.inth`. */
	pkg?: string;
	/**
	 * Set by the script-tag global. Script-tag files are always production
	 * builds, so their development diagnostics key off the page's host.
	 */
	scriptTag?: boolean;
}

/** Transport already selected by an entry point. */
export interface ResolvedMode {
	factory: ProviderTransportFactory;
	name: ConsentModeName | 'testing' | 'custom';
}

/**
 * The mode a transport factory such as `hosted()` or `manifest()` names.
 *
 * @internal
 */
export const factoryMode = function factoryMode(
	factory: ProviderTransportFactory
): ResolvedMode {
	const { kind } = factory;
	return {
		factory,
		name: kind === 'hosted' || kind === 'manifest' ? kind : 'custom',
	};
};

/**
 * The hosted backend at `projectUrl`.
 *
 * @param pkg - The entry, for the error.
 * @throws {Error} Without a `projectUrl`.
 * @internal
 */
export const hostedMode = function hostedMode(
	projectUrl: string | undefined,
	pkg: string
): ResolvedMode {
	if (!projectUrl) {
		throw new Error(
			`${pkg}: \`projectUrl\` is required. Set it to your Inth project URL (data-project-url on a script tag), or use testing() from @inth/sdk/testing in tests.`
		);
	}
	return { factory: hosted({ projectUrl }), name: 'hosted' };
};

const dispatchDocumentEvent = function dispatchDocumentEvent(
	name: keyof ConsentClientEventMap,
	detail: unknown
): void {
	if (typeof document === 'undefined') {
		return;
	}
	document.dispatchEvent(new CustomEvent(`inth:${name}`, { detail }));
};

/**
 * Run one `on()` listener so a throw is reported instead of stopping the
 * listeners after it and the matching `inth:*` document event.
 */
const callListener = function callListener<PayloadType>(
	event: keyof ConsentClientEventMap,
	listener: (payload: PayloadType) => void,
	payload: PayloadType
): void {
	try {
		listener(payload);
	} catch (error) {
		// oxlint-disable-next-line no-console -- A page listener failed; keep dispatching.
		console.error(
			`@inth/sdk: a "${event}" listener threw; the other listeners still run.`,
			error
		);
	}
};

const NO_VENDORS: readonly ResolvedVendor[] = [];

const resolvePageAction = function resolvePageAction(
	target: EventTarget | null
): PageAction | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const actionElement = target.closest(`[${ACTION_ATTRIBUTE}]`);
	const action = actionElement?.getAttribute(ACTION_ATTRIBUTE);
	if (action && PAGE_ACTIONS.has(action)) {
		return action as PageAction;
	}
	const link = target.closest('a[href]');
	const href = link?.getAttribute('href') ?? '';
	return href.endsWith(PREFERENCES_HASH) ? 'customize' : null;
};

const sameOptOutState = function sameOptOutState(
	left: OptOutState,
	right: OptOutState
): boolean {
	return (
		left.at === right.at &&
		left.available === right.available &&
		left.decidingCategory === right.decidingCategory &&
		left.honored === right.honored &&
		left.lock === right.lock &&
		left.optInPromptAllowedAt === right.optInPromptAllowedAt &&
		left.optedOut === right.optedOut &&
		left.reference === right.reference &&
		left.scope === right.scope &&
		left.source === right.source &&
		left.via === right.via &&
		left.categories.length === right.categories.length &&
		left.categories.every(
			(category, index) => category === right.categories[index]
		) &&
		left.rights.length === right.rights.length &&
		left.rights.every((rightName, index) => rightName === right.rights[index])
	);
};

/**
 * Create the page's consent client without starting it.
 *
 * Construction has no DOM or storage effects. Call {@link ConsentClient.start}
 * to hydrate stored records, resolve the policy and mount the UI.
 *
 * @throws {Error} When `options.iab` is on in an entry without IAB.
 */
// oxlint-disable-next-line max-lines-per-function -- One cohesive lifecycle: construct, start, dispose.
export const createConsentClientWith = function createConsentClientWith(
	options: Omit<ScriptTagClientOptions, 'mode'>,
	mode: ResolvedMode,
	context: CreateConsentClientContext = {}
): ConsentClient {
	if (options.iab && options.iab.enabled !== false && !context.createIAB) {
		throw new Error('@inth/sdk: IAB requires the @inth/sdk/iab-client entry.');
	}
	const runtime = createBrowserRuntime({
		callbacks: options.callbacks,
		clearOnRevocation: options.clearOnRevocation,
		consentCategories: options.consentCategories,
		consentSource: options.consentSource,
		createIAB: context.createIAB,
		enabled: options.enabled,
		experiment: options.experiment,
		experimentalScriptRegistry: options.experimentalScriptRegistry,
		gpp: options.gpp ?? context.defaultGPP,
		i18n: options.i18n,
		iab: context.createIAB ? (options.iab ?? { enabled: true }) : undefined,
		iframeBlocker: options.iframeBlocker,
		loadGPP: context.loadGPP,
		mode: mode.factory,
		networkBlocker: options.networkBlocker,
		nonce: options.nonce,
		overrides: options.overrides,
		persistence: options.persistence,
		pkg: options.pkg ?? context.pkg ?? '@inth/sdk',
		prefetch: options.prefetch,
		presentation: options.presentation,
		reloadOnConsentRevoked: options.reloadOnConsentRevoked,
		scriptLoader: options.scriptLoader,
		scripts: options.scripts,
		storageConfig: options.storageConfig,
		theme: options.ui === false ? undefined : options.ui?.theme,
		user: options.user,
		vendors: options.vendors,
	});
	const { kernel } = runtime;
	// Inert tags own the vendor slugs they name, the way scripts, rules and
	// iframes do, so a stored denial holds before a backend declares them.
	const gatedVendorSource = Symbol('gated-scripts');
	const gatedScripts = createGatedScriptActivator(() => kernel.getSnapshot(), {
		declareVendors: (owners) =>
			declareOwnedVendors(kernel, owners, gatedVendorSource),
		nonce: options.nonce,
		registerCategories: kernel.set.registerConsentCategories,
	});
	let startingRuntime = false;
	let drainingRuntimeEvents = false;
	const pendingRuntimeEvents: (() => void)[] = [];

	const listeners: {
		[EventName in keyof ConsentClientEventMap]: Set<
			(payload: ConsentClientEventMap[EventName]) => void
		>;
	} = {
		consent: new Set(),
		error: new Set(),
		ready: new Set(),
		surfaceShown: new Set(),
		ui: new Set(),
	};
	const dispatch = function dispatch<
		EventName extends keyof ConsentClientEventMap,
	>(event: EventName, payload: ConsentClientEventMap[EventName]): void {
		for (const listener of listeners[event]) {
			callListener(event, listener, payload);
		}
		dispatchDocumentEvent(event, payload);
	};
	const emit = function emit<EventName extends keyof ConsentClientEventMap>(
		event: EventName,
		payload: ConsentClientEventMap[EventName]
	): void {
		if (startingRuntime || drainingRuntimeEvents) {
			pendingRuntimeEvents.push(() => dispatch(event, payload));
			return;
		}
		dispatch(event, payload);
	};

	const ready = createDeferred<ConsentSnapshot>();
	let readySnapshot: ConsentSnapshot | null = null;
	const completeReady = function completeReady(
		snapshot: ConsentSnapshot
	): void {
		if (readySnapshot) {
			return;
		}
		readySnapshot = snapshot;
		ready.resolve(snapshot);
		dispatch('ready', snapshot);
	};
	const markReady = function markReady(snapshot: ConsentSnapshot): void {
		if (startingRuntime || drainingRuntimeEvents) {
			// A ready listener may dispose the client. Let the runtime finish
			// registering its own resources before notifying browser listeners.
			pendingRuntimeEvents.push(() => completeReady(snapshot));
			return;
		}
		completeReady(snapshot);
	};

	let ui: ConsentUIHandle | null = null;
	let started = false;
	let disposed = false;
	let detachPageActions: (() => void) | null = null;

	// IAB is opt-in. The stock banner and dialog stand aside for an `iab`
	// policy, so a page without the IAB UI would leave the visitor with no
	// banner at all, whatever vendor data the backend sent. Report it as an
	// `error` event and throw it outside the kernel's listener loop, so it
	// reaches the console as an uncaught error. Once per client.
	const iabOn =
		context.createIAB !== undefined &&
		isIABConfigured(options.iab ?? { enabled: true });
	let iabReported = false;
	const reportIABUnavailable = function reportIABUnavailable(
		snapshot: ConsentSnapshot
	): void {
		if (
			iabOn ||
			iabReported ||
			snapshot.resolution.status !== 'matched' ||
			snapshot.policyRule.model !== 'iab' ||
			snapshot.externalPermissions !== undefined
		) {
			return;
		}
		iabReported = true;
		const error = context.createIAB
			? new IABUnavailableError(
					'IAB is turned off',
					'Remove `iab: false` or `iab.enabled: false`'
				)
			: new IABUnavailableError(
					'this page loads the build without IAB',
					'Load inth.iab.js instead of inth.js, or import from @inth/sdk/iab-client'
				);
		emit('error', error);
		queueMicrotask(() => {
			throw error;
		});
	};

	const initial = kernel.getSnapshot();
	let lastActiveUI: KernelActiveUI = initial.activeUI;
	let lastConsents = initial.effectivePermissions;
	let lastHasConsented = initial.explicitChoice;
	let lastOptOutState = resolveOptOut(initial, getOptOutReceiptData(kernel));
	let lastVendorChoice = initial.vendorChoice;
	let lastVendors = initial.vendors;
	const notifyConsentIfChanged = function notifyConsentIfChanged(
		snapshot: ConsentSnapshot
	): void {
		const optOutState = resolveOptOut(snapshot, getOptOutReceiptData(kernel));
		if (
			snapshot.effectivePermissions === lastConsents &&
			snapshot.explicitChoice === lastHasConsented &&
			sameOptOutState(optOutState, lastOptOutState) &&
			snapshot.vendorChoice === lastVendorChoice &&
			snapshot.vendors === lastVendors
		) {
			return;
		}
		lastConsents = snapshot.effectivePermissions;
		lastHasConsented = snapshot.explicitChoice;
		lastOptOutState = optOutState;
		lastVendorChoice = snapshot.vendorChoice;
		lastVendors = snapshot.vendors;
		if (started && !startingRuntime) {
			gatedScripts.scan();
		}
		emit('consent', snapshot);
	};
	const disposers: (() => void)[] = [
		gatedScripts.dispose,
		() => forgetOwnedVendors(kernel, gatedVendorSource),
		kernel.events.on('init:applied', ({ snapshot }) => {
			markReady(snapshot);
		}),
		kernel.events.on('command:error', ({ error }) => {
			emit('error', error);
		}),
		kernel.events.on('surface:shown', ({ type: _type, ...impression }) => {
			emit('surfaceShown', impression);
		}),
		subscribeOptOutReceiptData(kernel, () => {
			notifyConsentIfChanged(kernel.getSnapshot());
		}),
		// Saves and hydration can change permissions, opt-out state or receipts;
		// one subscription observes every path.
		kernel.subscribe((snapshot) => {
			reportIABUnavailable(snapshot);
			notifyConsentIfChanged(snapshot);
			if (snapshot.activeUI !== lastActiveUI) {
				lastActiveUI = snapshot.activeUI;
				emit('ui', snapshot.activeUI);
			}
		}),
	];

	// The categories the dialog offers: `necessary` plus the choice scope,
	// in core's fixed display order, as in the preference draft and every
	// framework.
	const categories = (): AllConsentNames[] => runtime.consentCategories;

	// Surfaces close and follow through core's surface actions: a save
	// closes on the local record, explicit navigation supersedes it.
	const closeSurfaces = (): void => {
		closeOptInConfirmation(kernel);
		closeOptOutConfirmation(kernel);
		showConsentSurface(kernel, 'none');
	};
	const openDialog = (): void => {
		closeOptInConfirmation(kernel);
		closeOptOutConfirmation(kernel);
		showConsentSurface(kernel, 'dialog');
	};
	const showBanner = (): void => {
		closeOptInConfirmation(kernel);
		closeOptOutConfirmation(kernel);
		showConsentSurface(kernel, 'banner');
	};
	const optOut = (): Promise<OptOutResult> => optOutConsentSurface(kernel);
	const saveSelection = (input: SaveInput): Promise<SaveResult> => {
		closeOptOutConfirmation(kernel);
		return saveConsentSurface(kernel, () =>
			kernel.commands.save(input, { categories: categories() })
		);
	};
	/**
	 * Save an IAB choice through the CMP, applying a blanket first. The IAB
	 * UI has no opt-in fallback: without the CMP and its vendor list it shows
	 * the error, so this reports one and confirms nothing.
	 */
	const emitError = (error: unknown): void => {
		emit('error', error instanceof Error ? error : new Error(String(error)));
	};
	const saveIAB = async (blanket?: 'acceptAll' | 'rejectAll') => {
		const handle = runtime.iab;
		const snapshot = kernel.getSnapshot();
		try {
			if (
				!(handle && snapshot.iab?.gvl && snapshot.policyRule.model === 'iab')
			) {
				throw new Error('IAB privacy settings are not ready.');
			}
			return await saveIABConsentSurface(
				kernel,
				() => {
					if (blanket) {
						handle[blanket]();
					}
					return handle.save();
				},
				emitError
			);
		} catch (error) {
			emitError(error);
			return { ok: false };
		}
	};
	const acceptAll = (): Promise<SaveResult> =>
		kernel.getSnapshot().policyRule.model === 'iab'
			? saveIAB('acceptAll')
			: saveSelection('all');
	const rejectAll = (): Promise<SaveResult> =>
		kernel.getSnapshot().policyRule.model === 'iab'
			? saveIAB('rejectAll')
			: saveSelection('none');

	const resolvedPresentation = (): ConsentPresentation | undefined =>
		applyExperimentAssignment(
			options.presentation,
			runtime.experiment,
			kernel.getSnapshot().experiment
		);

	const onPageClick = function onPageClick(event: MouseEvent): void {
		const action = resolvePageAction(event.target);
		if (!action) {
			return;
		}
		event.preventDefault();
		switch (action) {
			case 'accept': {
				if (kernel.getSnapshot().policyRule.model === 'iab') {
					void saveIAB('acceptAll');
				} else {
					void saveConsentSurfaceWithOptInCheck(
						kernel,
						'all',
						() => kernel.commands.save('all', { categories: categories() }),
						{ categories: categories() }
					);
				}
				break;
			}
			case 'reject': {
				void rejectAll();
				break;
			}
			case 'customize': {
				openDialog();
				break;
			}
			case 'opt-out': {
				const { variant } = resolveOptOutLink(
					undefined,
					resolvedPresentation()?.optOutLink
				);
				void activateOptOutLink(kernel, variant);
				break;
			}
			case 'dismiss': {
				void kernel.commands.dismissNotice();
				break;
			}
			case 'banner': {
				showBanner();
				break;
			}
			default: {
				closeSurfaces();
			}
		}
	};

	const client: ConsentClient = {
		acceptAll,
		closeDialog: closeSurfaces,
		get consentCategories() {
			return categories();
		},
		dismissNotice: () => kernel.commands.dismissNotice(),
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			started = false;
			closeOptInConfirmation(kernel);
			closeOptOutConfirmation(kernel);
			detachPageActions?.();
			detachPageActions = null;
			ui?.destroy();
			ui = null;
			for (const dispose of disposers.reverse()) {
				dispose();
			}
			disposers.length = 0;
			runtime.dispose();
		},
		getDeclaredVendors() {
			const snapshot = kernel.getSnapshot();
			return snapshot.model === 'iab'
				? NO_VENDORS
				: (snapshot.vendors?.declared ?? NO_VENDORS);
		},
		getOptOutState() {
			return resolveOptOut(kernel.getSnapshot(), getOptOutReceiptData(kernel));
		},
		getSnapshot() {
			return kernel.getSnapshot();
		},
		getVendorChoice() {
			return kernel.getSnapshot().vendorChoice;
		},
		has(condition: HasCondition<AllConsentNames>) {
			const snapshot = kernel.getSnapshot();
			return evaluateConsent({ category: condition }, snapshot);
		},
		hasConsented() {
			return hasDecided(kernel.getSnapshot());
		},
		async identify(user: KernelUser) {
			await runtime.identify(user);
		},
		isVendorAllowed(vendorId: string) {
			return isVendorAllowed(kernel.getSnapshot(), vendorId);
		},
		kernel,
		mode: mode.name,
		mountUI(uiOptions?: ConsentUIOptions) {
			if (!context.mountUI) {
				throw new Error(
					'@inth/sdk: this build is headless. Load inth.js, or import `mountConsentUI` from "@inth/sdk".'
				);
			}
			ui?.destroy();
			ui = context.mountUI(
				client,
				uiOptions ?? (options.ui === false ? undefined : options.ui)
			);
			return ui;
		},
		on(event, listener) {
			const set = listeners[event] as Set<typeof listener>;
			set.add(listener);
			// A listener attached after the fact still learns the runtime is
			// ready, the way a resolved promise would tell it; a `ui` listener
			// learns which surface is already up, so a custom banner wired
			// after a fast offline init does not miss its cue.
			if (event === 'ready' && readySnapshot) {
				callListener(
					event,
					listener as (payload: ConsentSnapshot) => void,
					readySnapshot
				);
			}
			if (event === 'ui' && readySnapshot) {
				callListener(
					event,
					listener as (payload: KernelActiveUI) => void,
					kernel.getSnapshot().activeUI
				);
			}
			return function unsubscribe() {
				set.delete(listener);
			};
		},
		openDialog,
		optOut,
		options,
		get presentation(): ConsentPresentation | undefined {
			return resolvedPresentation();
		},
		processIframes() {
			runtime.processIframes();
		},
		ready() {
			return ready.promise;
		},
		rejectAll,
		runtime,
		save(consents: ConsentSaveInput) {
			if (kernel.getSnapshot().policyRule.model === 'iab') {
				emit('error', new Error('Use saveIAB() to confirm IAB preferences.'));
				return Promise.resolve({ ok: false });
			}
			const { vendors, ...rest } = consents;
			const allowed = new Set<string>(categories());
			const selection: Exclude<SaveInput, string> = Object.fromEntries(
				Object.entries(rest).filter(([name]) => allowed.has(name))
			);
			if (vendors) {
				selection.vendors = { ...vendors };
			}
			return saveSelection(selection);
		},
		saveIAB: () => saveIAB(),
		setLanguage(code: string) {
			runtime.setLanguage(code);
		},
		setOverrides(overrides: KernelOverrides) {
			runtime.setOverrides(overrides);
		},
		showBanner,
		start() {
			if (started || disposed || typeof document === 'undefined') {
				return;
			}
			started = true;
			if (context.onStart && options.enabled !== false) {
				disposers.push(context.onStart(options));
			}
			startingRuntime = true;
			try {
				runtime.start();
			} finally {
				startingRuntime = false;
			}
			// A prefetch can carry the policy before any snapshot changes.
			reportIABUnavailable(kernel.getSnapshot());
			drainingRuntimeEvents = true;
			try {
				// Listener-triggered events follow notifications already queued.
				for (const notify of pendingRuntimeEvents) {
					if (disposed) {
						break;
					}
					notify();
				}
			} finally {
				drainingRuntimeEvents = false;
				pendingRuntimeEvents.length = 0;
			}
			if (disposed) {
				return;
			}
			// Inert `<script type="text/plain" data-inth-category>` tags a
			// returning visitor already consented to run straight away.
			gatedScripts.scan();
			if (disposed) {
				return;
			}
			const observer = new MutationObserver(() => gatedScripts.scan());
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
			});
			disposers.push(() => observer.disconnect());
			if (options.enabled === false) {
				// Nothing will ever resolve a policy; do not leave `ready()`
				// hanging for callers that gate analytics on it.
				markReady(kernel.getSnapshot());
				if (disposed) {
					return;
				}
			}
			document.addEventListener('click', onPageClick);
			detachPageActions = () => {
				document.removeEventListener('click', onPageClick);
			};
			if (options.ui === false || !context.mountUI) {
				return;
			}
			// A script in `<head>` runs before `<body>` exists; the runtime can
			// start now, the UI has to wait for somewhere to mount.
			const mount = function mount(): void {
				if (!(disposed || ui)) {
					ui = client.mountUI();
				}
			};
			if (document.body) {
				mount();
				return;
			}
			document.addEventListener('DOMContentLoaded', mount, { once: true });
			disposers.push(() => {
				document.removeEventListener('DOMContentLoaded', mount);
			});
		},
		get started() {
			return started;
		},
		subscribe(listener) {
			return kernel.subscribe(listener);
		},
		get theme(): Theme | undefined {
			// A headless client renders nothing, so an arm's theme has nothing
			// to override; the getter stays `undefined` whatever is assigned.
			if (options.ui === false) {
				return undefined;
			}
			return applyExperimentTheme(
				options.ui?.theme,
				runtime.experiment,
				kernel.getSnapshot().experiment
			);
		},
		get ui() {
			return ui;
		},
	};

	return client;
};
