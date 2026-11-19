/**
 * The script loader, written against {@link ScriptLoaderTools}: it imports
 * nothing the first-load graph has, so it can load on demand as one chunk.
 * `index.ts` is the public entry and passes the shared implementations.
 */
import type { ConsentSnapshot } from '../../types';
import { isCallbackOnly } from './callback-only';
import { buildCallbackInfo, invokeCallback } from './callbacks';
import { createDebugEmitter } from './debug';
import { registerScriptDiagnostics } from './diagnostics';
import type { ScriptDiagnostic, ScriptDiagnosticStatus } from './diagnostics';
import { buildReconcilePass, hasScriptConsent } from './eligibility';
import { pinRegistryFiles } from './files';
import type { FilePin } from './files';
import {
	flushPendingMounts,
	mountScript,
	releaseScriptElement,
	unmountScript,
} from './mount';
import type { MountDeps } from './mount';
import {
	createElementIdResolver,
	hasSameResource,
	normalizeScripts,
} from './normalize';
import { readScriptRegistry } from './registry';
import { createScriptSourceResolver } from './sources';
import type { HeldScript, ScriptRegistryState } from './sources';
import type {
	NormalizedScript,
	PendingMount,
	Script,
	ScriptCallbackInfo,
	ScriptLoaderHandle,
	ScriptLoaderOptions,
	ScriptLoaderDebugEvent,
	ScriptLoaderTools,
} from './types';

const MAX_RECONCILE_PASSES = 100;

/** Why a held script does not load, for `onDebug`. */
const heldMessage = (
	reason: HeldScript['reason'],
	script: Script,
	path: string | undefined
): string => {
	if (reason === 'unparsable') {
		return `scriptLoader.sources gives ${script.id} an integrity with no hash a browser can parse, so it does not load: the browser would run it unchecked.`;
	}
	if (reason === 'option') {
		return script.integrationOptions
			? `The script registry refuses ${script.id} because its options set ${path}: with it, its loader downloads code from a server the registry cannot pin. It loads neither from the registry nor from ${script.src}.`
			: `The script registry refuses ${script.id} unless its options leave ${path} unset, and ${script.id} carries no integrationOptions to check, so it loads neither from the registry nor from ${script.src}.`;
	}
	return `The script registry holds ${script.id} back, or lists it without an https src and an integrity hash, so it loads neither from the registry nor from ${script.src}.`;
};

const validateScripts = (scripts: Script[]): void => {
	for (const script of scripts) {
		script.validate?.(script);
	}
};

/**
 * Create a script loader from the tools it calls.
 *
 * @internal
 */
export const createScriptLoaderWith = function createScriptLoaderWith(
	options: ScriptLoaderOptions,
	tools: ScriptLoaderTools
): ScriptLoaderHandle {
	const { categoriesOf, declareOwners, forgetOwners, gateState, isVendorId } =
		tools;
	const { kernel, onDebug } = options;
	const emitToV2 = options.emitToV2DebugListeners ?? true;
	const emitDebug = createDebugEmitter({
		dispatch: emitToV2 ? tools.debug : undefined,
		onDebug,
	});
	const hasDebugListener = !!onDebug || emitToV2;
	const lastEvents = new Map<string, ScriptLoaderDebugEvent>();
	const statuses = new Map<string, ScriptDiagnosticStatus>();
	let diagnostics: ReturnType<typeof registerScriptDiagnostics> | undefined;
	const emit = (event: ScriptLoaderDebugEvent): void => {
		lastEvents.set(event.scriptId, event);
		if (event.action === 'load_completed') {
			statuses.set(event.scriptId, 'loaded');
		} else if (event.action === 'loaded' && !statuses.has(event.scriptId)) {
			statuses.set(event.scriptId, 'loading');
		} else if (event.action === 'error') {
			statuses.set(event.scriptId, 'error');
		} else if (
			event.action === 'already_loaded' &&
			!statuses.has(event.scriptId)
		) {
			statuses.set(event.scriptId, 'present');
		} else if (event.action === 'unloaded' && event.data?.retained !== true) {
			statuses.delete(event.scriptId);
		}
		emitDebug(event);
		diagnostics?.notify(event);
	};

	const ownerSource = Symbol('script-loader');
	let replacingScript: Script | undefined;
	const registerCategories = (scripts: Script[]) => {
		kernel.set.registerConsentCategories(
			scripts.flatMap((script) => categoriesOf(script.category))
		);
		declareOwners(kernel, scripts, ownerSource);
	};
	// Read once init resolves; a later init's list does not move scripts.
	const readRegistry = (snapshot: ConsentSnapshot): ScriptRegistryState =>
		readScriptRegistry(
			options.registry?.waitForInit
				? snapshot
				: { ...snapshot, policyPending: false }
		);
	let registryState: ScriptRegistryState = options.registry
		? readRegistry(kernel.getSnapshot())
		: { status: 'failed' };
	let stopWaiting: (() => void) | undefined;
	// The registry's files pin what loaders download while they run. It goes
	// on just before this loader first mounts: while the list is pending, so
	// nothing leaves before the pin knows whether it is listed, and when the
	// list names files. A list without files takes it off, and so does any
	// way the loader shuts down.
	let filePin: FilePin | null | undefined;
	let pinReleased = false;
	const releasePin = (): void => {
		pinReleased = true;
		filePin?.dispose();
		filePin = undefined;
	};
	const pinFiles = (state: ScriptRegistryState): void => {
		if (!options.registry || pinReleased) {
			return;
		}
		if (state.status === 'pending') {
			filePin ??= pinRegistryFiles(null);
			return;
		}
		const files = state.status === 'listed' ? (state.files ?? {}) : {};
		if (Object.keys(files).length === 0) {
			filePin?.dispose();
			filePin = undefined;
		} else if (filePin) {
			filePin.list(files);
		} else {
			filePin = pinRegistryFiles(files);
		}
	};
	const withSources = createScriptSourceResolver(
		options.sources,
		options.registry ? () => registryState : undefined
	);
	/** The list as given, so the registry's list can resolve it again. */
	let configured: readonly Script[] = options.scripts;
	/** Whether `configured` waits to replace the registered scripts. */
	let staged = false;
	/** Scripts registered for consent but not mounted; see `HeldScript`. */
	let held: HeldScript[] = [];
	const refusedIds = new Set<string>();
	/** Resolve a list and keep what it holds back; returns what mounts. */
	const resolveSources = (scripts: readonly Script[]): Script[] => {
		const resolved = withSources(scripts);
		// A held script is checked once it resolves, against the URL it then
		// loads from, so it is not compared with its vendor URL meanwhile.
		validateScripts(resolved.scripts);
		({ held } = resolved);
		for (const { path, reason, script } of held) {
			if (reason === 'waiting' || refusedIds.has(script.id)) {
				continue;
			}
			refusedIds.add(script.id);
			emit({
				action: 'error',
				data: path === undefined ? undefined : { refuseIfSet: path },
				message: heldMessage(reason, script, path),
				scope: 'lifecycle',
				scriptId: script.id,
				source: 'script-loader',
				timestamp: Date.now(),
			});
		}
		return resolved.scripts;
	};
	const initialScripts = resolveSources(options.scripts);
	registerCategories([...initialScripts, ...held.map(({ script }) => script)]);
	let normalized: NormalizedScript[] = normalizeScripts(
		initialScripts,
		isVendorId
	);

	const loadedElements = new Map<string, HTMLScriptElement | null>();
	const retainedElements = new Map<string, HTMLScriptElement>();
	const ownedScriptIds = new Set<string>();
	const elementIds = createElementIdResolver();
	const eligibilityByScriptId = new Map<string, boolean>();
	const consentByScriptId = new Map<string, boolean>();
	const consentReaders = new Map<
		Script,
		{ read: () => ScriptCallbackInfo; frozen?: ScriptCallbackInfo }
	>();
	let cleaningUp = false;
	const replacementEffects = new Set<() => void>();
	// Another source can sweep this loader's slugs out of the declared set: a
	// provider replacing its own script entries, or a backend init dropping a
	// vendor a script here still names. A mounted loader's scripts own their
	// slugs for as long as they are configured, so put them back before the
	// gate runs; a stored denial for one of them would otherwise be ignored
	// for the pass. Idempotent: nothing missing means no commit.
	const declareMissingVendors = (snapshot: ConsentSnapshot): void => {
		const declared = new Set(
			snapshot.vendors?.declared.map((vendor) => vendor.id)
		);
		const missing =
			normalized.some(
				({ vendor }) => vendor !== null && !declared.has(vendor)
			) ||
			held.some(({ script }) => script.vendor && !declared.has(script.vendor));
		if (missing) {
			declareOwners(
				kernel,
				[
					...normalized.map(({ script }) => script),
					...held.map(({ script }) => script),
				],
				ownerSource
			);
		}
	};

	const callbackTools: ScriptLoaderTools = {
		...tools,
		getConsentReader: (script) => {
			const existing = consentReaders.get(script);
			if (existing) {
				return existing.read;
			}
			if (!normalized.some((entry) => entry.script === script)) {
				return;
			}
			const reader: {
				read: () => ScriptCallbackInfo;
				frozen?: ScriptCallbackInfo;
			} = {
				read: () => {
					if (reader.frozen) {
						return reader.frozen;
					}
					const entry = normalized.find(
						(candidate) => candidate.script === script
					);
					if (!entry) {
						throw new Error('Script consent reader outlived its registration');
					}
					// Another source can remove declarations while callbacks are
					// running. Repair our active ownership just as reconcile does.
					declareMissingVendors(kernel.getSnapshot());
					if (reader.frozen) {
						return reader.frozen;
					}
					const snapshot = kernel.getSnapshot();
					return buildCallbackInfo(
						callbackTools,
						script,
						snapshot,
						hasScriptConsent(entry, buildReconcilePass(snapshot, tools)),
						elementIds.resolve(script),
						loadedElements.get(script.id) ?? retainedElements.get(script.id)
					);
				},
			};
			consentReaders.set(script, reader);
			return reader.read;
		},
		getLoadErrorReporter: (script) => (error) => {
			const entry = normalized.find((candidate) => candidate.script === script);
			// Disposal empties `normalized`, so a late report finds nothing.
			if (!entry) {
				return;
			}
			const snapshot = kernel.getSnapshot();
			const elementId = elementIds.resolve(script);
			invokeCallback(
				script,
				'onError',
				buildCallbackInfo(
					callbackTools,
					script,
					snapshot,
					hasScriptConsent(entry, buildReconcilePass(snapshot, tools)),
					elementId,
					undefined,
					error
				),
				emit
			);
			emit({
				action: 'error',
				elementId,
				message: `Script failed: ${error.message}`,
				scope: 'lifecycle',
				scriptId: script.id,
				source: 'script-loader',
				timestamp: Date.now(),
			});
		},
		isReplacing: (script) => script === replacingScript,
		registration: ownerSource,
	};
	const freezeConsentReader = (script: Script): void => {
		if (!consentReaders.has(script) && !script.onDispose) {
			return;
		}
		const current = callbackTools.getConsentReader?.(script)?.();
		const reader = consentReaders.get(script);
		if (reader) {
			reader.frozen = current;
		}
	};

	let unsubscribe: (() => void) | undefined;
	let disposed = false;
	let processing = false;
	let pendingScripts: readonly Script[] | undefined;
	let reconcileRequested = false;
	let forceReconcile = false;

	// A callback can request changes while this pass is still mounting scripts.
	const isCurrentPass = () =>
		!disposed && pendingScripts === undefined && !reconcileRequested;

	const mountDeps: MountDeps = {
		elementIds,
		emit,
		getCurrentScript: (scriptId, snapshot) => {
			const entry = normalized.find(({ script }) => script.id === scriptId);
			return entry
				? {
						hasConsent: hasScriptConsent(
							entry,
							buildReconcilePass(snapshot, tools)
						),
						script: entry.script,
					}
				: undefined;
		},
		getSnapshot: kernel.getSnapshot,
		hasDebugListener,
		isDisposed: () => disposed,
		loadedElements,
		nonce: options.nonce,
		ownedScriptIds,
		retainedElements,
		tools: callbackTools,
	};

	// Track the last-seen consent-relevant references so a kernel tick
	// that didn't actually change consent state (e.g. only `overrides`
	// flipped) skips the full reconcile. Hot-path optimization for pages
	// with many scripts and many subscribers.
	let lastConsents: unknown = null;
	let lastPolicyCategories: unknown = null;
	let lastScopeMode: unknown = null;
	let lastIab: unknown = null;
	let lastRestrictions: unknown = null;
	let lastModel: unknown = null;
	let lastEvaluationPolicy: unknown = null;
	let lastVendorChoice: unknown = null;
	let lastVendors: unknown = null;

	const isConsentStateUnchanged = (snapshot: ConsentSnapshot): boolean => {
		const effective = gateState(snapshot);
		return (
			effective.effectivePermissions === lastConsents &&
			snapshot.policyRule.scope === lastPolicyCategories &&
			snapshot.policyRule.scopeMode === lastScopeMode &&
			snapshot.iab === lastIab &&
			effective.restrictions === lastRestrictions &&
			snapshot.model === lastModel &&
			snapshot.evaluationPolicy === lastEvaluationPolicy &&
			snapshot.vendorChoice === lastVendorChoice &&
			snapshot.vendors === lastVendors
		);
	};

	// A held script loads nothing, but one that observes consent before it
	// loads can control an SDK already on the page, so it still hears of a
	// denial. It never hears of a grant, which would start it.
	const notifyHeldDenials = (
		snapshot: ConsentSnapshot,
		pass: ReturnType<typeof buildReconcilePass>
	): void => {
		if (typeof document === 'undefined') {
			return;
		}
		for (const entry of normalizeScripts(
			held.map(({ script }) => script),
			isVendorId
		)) {
			const { script } = entry;
			if (
				!isCurrentPass() ||
				!script.observeConsentBeforeLoad ||
				typeof script.onConsentChange !== 'function' ||
				hasScriptConsent(entry, pass)
			) {
				continue;
			}
			invokeCallback(
				script,
				'onConsentChange',
				buildCallbackInfo(
					callbackTools,
					script,
					snapshot,
					false,
					elementIds.resolve(script)
				),
				emit
			);
		}
	};

	const reconcile = function reconcile(force = false): void {
		let snapshot: ConsentSnapshot = kernel.getSnapshot();
		if (snapshot.vendors !== lastVendors) {
			declareMissingVendors(snapshot);
			snapshot = kernel.getSnapshot();
		}
		const effective = gateState(snapshot);
		const permissionsChanged = effective.effectivePermissions !== lastConsents;

		if (!force && isConsentStateUnchanged(snapshot)) {
			return;
		}
		lastVendorChoice = snapshot.vendorChoice;
		lastVendors = snapshot.vendors;
		lastConsents = effective.effectivePermissions;
		lastRestrictions = effective.restrictions;
		lastModel = snapshot.model;
		lastEvaluationPolicy = snapshot.evaluationPolicy;
		lastPolicyCategories = snapshot.policyRule.scope;
		lastScopeMode = snapshot.policyRule.scopeMode;
		lastIab = snapshot.iab;

		const pass = buildReconcilePass(snapshot, tools);
		const batch: PendingMount[] = [];

		for (const entry of normalized) {
			const { script } = entry;
			const hasConsent = hasScriptConsent(entry, pass);
			const eligible = script.alwaysLoad === true || hasConsent;
			const previousEligibility = eligibilityByScriptId.get(script.id);
			const previousConsent = consentByScriptId.get(script.id);
			eligibilityByScriptId.set(script.id, eligible);
			consentByScriptId.set(script.id, hasConsent);

			// Always-loaded integrations can map several categories (Google
			// Consent Mode), so they need updates even when mounting is unchanged.
			if (
				!force &&
				previousEligibility === eligible &&
				previousConsent === hasConsent &&
				!(
					(permissionsChanged || script.observeConsentBeforeLoad) &&
					typeof script.onConsentChange === 'function'
				)
			) {
				continue;
			}

			if (eligible) {
				retainedElements.delete(script.id);
				mountScript(
					mountDeps,
					script,
					snapshot,
					hasConsent,
					batch,
					isCurrentPass
				);
			} else {
				unmountScript(mountDeps, script, snapshot, hasConsent);
			}
			if (!isCurrentPass()) {
				break;
			}
		}
		notifyHeldDenials(snapshot, pass);

		flushPendingMounts(mountDeps, batch, isCurrentPass);
		diagnostics?.notify();
	};

	diagnostics = registerScriptDiagnostics(
		kernel,
		(loaderId): ScriptDiagnostic[] =>
			normalized.map((entry) => {
				const { script } = entry;
				const eligible = eligibilityByScriptId.get(script.id) ?? false;
				const elementId = elementIds.resolve(script);
				const retainedElement = retainedElements.get(script.id);
				const retained =
					!eligible &&
					retainedElement?.isConnected &&
					typeof document !== 'undefined' &&
					document.getElementById(elementId) === retainedElement;
				let status: ScriptDiagnosticStatus = eligible ? 'pending' : 'blocked';
				if (retained) {
					status = 'retained';
				} else if (loadedElements.has(script.id)) {
					status = statuses.get(script.id) ?? 'present';
					if (
						(!script.src || loadedElements.get(script.id) === null) &&
						status === 'loading'
					) {
						status = 'loaded';
					}
				}
				return {
					alwaysLoad: script.alwaysLoad ?? false,
					callbackOnly: isCallbackOnly(script),
					category: script.category,
					elementId,
					eligible,
					hasConsent: hasScriptConsent(
						entry,
						buildReconcilePass(kernel.getSnapshot(), tools)
					),
					id: script.id,
					lastEvent: lastEvents.get(script.id),
					loaderId,
					persistAfterConsentRevoked:
						script.persistAfterConsentRevoked ?? false,
					src: script.src,
					status,
					vendor: script.vendor,
					vendorId: script.vendorId,
				};
			})
	);
	const disposeScript = (
		script: Script,
		element = loadedElements.get(script.id) ?? retainedElements.get(script.id)
	): void => {
		if (!script.onDispose) {
			return;
		}
		const current = kernel.getSnapshot();
		const snapshot = cleaningUp
			? {
					...current,
					vendors: {
						declared: tools.withoutOwners(kernel, ownerSource),
						listVersion: current.vendors?.listVersion ?? null,
					},
				}
			: current;
		const hasConsent = consentByScriptId.get(script.id) ?? false;
		const info = buildCallbackInfo(
			callbackTools,
			script,
			snapshot,
			hasConsent,
			elementIds.resolve(script),
			element
		);
		if (info.replacing) {
			Object.defineProperty(info, 'afterReplacement', {
				value: (effect: () => void) =>
					replacementEffects.add(() =>
						invokeCallback(script, 'onDispose', info, emit, effect)
					),
			});
		}
		invokeCallback(script, 'onDispose', info, emit);
	};

	const cleanup = (): void => {
		// Each object owns one cleanup per registration, even if repeated.
		const scripts = new Set(normalized.map(({ script }) => script));
		const persistentIds = new Set(
			[...scripts]
				.filter((script) => script.persistAfterDispose)
				.map((script) => script.id)
		);
		// Keep declarations and readers live through every disposal callback:
		// an earlier onDispose can save a withdrawal before a later one runs.
		cleaningUp = true;
		pendingScripts = undefined;
		for (const script of scripts) {
			disposeScript(script);
			freezeConsentReader(script);
		}
		normalized = [];
		forgetOwners(kernel, ownerSource);
		cleaningUp = false;
		diagnostics?.dispose();
		diagnostics = undefined;
		stopWaiting?.();
		releasePin();
		for (const [scriptId, element] of new Map([
			...retainedElements,
			...loadedElements,
		])) {
			if (element) {
				releaseScriptElement(
					mountDeps,
					scriptId,
					element,
					persistentIds.has(scriptId),
					true
				);
			}
		}
		loadedElements.clear();
		retainedElements.clear();
		ownedScriptIds.clear();
		elementIds.clear();
		eligibilityByScriptId.clear();
		consentByScriptId.clear();
		consentReaders.clear();
		lastEvents.clear();
		statuses.clear();
	};

	const replaceScripts = (configuredNext: readonly Script[]): void => {
		const heldBefore = held;
		const next = resolveSources(configuredNext);
		configured = configuredNext;
		// A waiting script's check runs once the list arrives. Until then the
		// batch waits too, so a check that fails leaves the registered
		// scripts in place, as it would have if it had run now.
		staged = held.some(
			({ reason, script }) => reason === 'waiting' && script.validate
		);
		if (staged) {
			held = heldBefore;
			return;
		}
		const nextScripts = new Set(next);
		const nextById = new Map(next.map((script) => [script.id, script]));
		const previous = new Set(normalized.map(({ script }) => script));
		const snapshot = kernel.getSnapshot();
		for (const script of previous) {
			if (nextScripts.has(script)) {
				continue;
			}
			const replacement = nextById.get(script.id);
			// Existing vendor helpers are recreated on framework rerenders. Keep
			// their resource mounted unless it or the disposal callback changed.
			// A stable disposer retains a DOM resource's registration lifecycle.
			// A mounted registration keeps the mode it mounted with: callback-only
			// predicates can turn true once the SDK they load has started. An
			// element retained after revocation is still a DOM registration.
			let mountedCallbackOnly = isCallbackOnly(script);
			if (loadedElements.has(script.id)) {
				mountedCallbackOnly = loadedElements.get(script.id) === null;
			} else if (retainedElements.has(script.id)) {
				mountedCallbackOnly = false;
			}
			if (
				replacement &&
				script.onDispose === replacement.onDispose &&
				(!script.onDispose || !mountedCallbackOnly) &&
				hasSameResource(script, replacement)
			) {
				freezeConsentReader(script);
				consentReaders.delete(script);
				continue;
			}
			// Resource replacement starts a fresh lifecycle, even for the same ID.
			// Persistence applies to consent revocation, not config replacement.
			const element =
				loadedElements.get(script.id) ?? retainedElements.get(script.id);
			replacingScript = replacement ? script : undefined;
			try {
				unmountScript(mountDeps, script, snapshot, false, true);
				disposeScript(script, element);
			} finally {
				replacingScript = undefined;
			}
			freezeConsentReader(script);
			consentReaders.delete(script);
			retainedElements.delete(script.id);
			eligibilityByScriptId.delete(script.id);
			consentByScriptId.delete(script.id);
			lastEvents.delete(script.id);
			statuses.delete(script.id);
		}
		normalized = normalizeScripts(next, isVendorId);
		if (!disposed) {
			registerCategories([...next, ...held.map(({ script }) => script)]);
			reconcileRequested = true;
			forceReconcile = true;
		}
	};

	// Serialize lifecycle changes. Callbacks can request another configuration
	// or dispose the loader without recursively cleaning up the current one.
	const drain = (): void => {
		if (processing) {
			return;
		}
		processing = true;
		let passes = 0;
		try {
			while (pendingScripts || reconcileRequested) {
				if (disposed) {
					break;
				}
				passes += 1;
				if (passes > MAX_RECONCILE_PASSES) {
					disposed = true;
					unsubscribe?.();
					unsubscribe = undefined;
					emit({
						action: 'error',
						message: 'Script callback feedback loop detected; loader disposed',
						scope: 'phase',
						scriptId: '',
						source: 'script-loader',
						timestamp: Date.now(),
					});
					break;
				}
				if (pendingScripts) {
					const next = pendingScripts;
					pendingScripts = undefined;
					replaceScripts(next);
				} else {
					const force = forceReconcile;
					reconcileRequested = false;
					forceReconcile = false;
					reconcile(force);
				}
			}
		} finally {
			if (disposed) {
				cleanup();
			}
			processing = false;
			const effects = [...replacementEffects];
			replacementEffects.clear();
			for (const effect of effects) {
				effect();
			}
		}
	};
	unsubscribe = kernel.subscribe(() => {
		if (processing && isConsentStateUnchanged(kernel.getSnapshot())) {
			return;
		}
		// Revisit mounts skipped when a callback interrupts the active pass,
		// even if their eligibility is unchanged in the next snapshot.
		forceReconcile ||= processing;
		reconcileRequested = true;
		drain();
	});
	const handle: ScriptLoaderHandle = {
		dispose() {
			releasePin();
			if (disposed) {
				return;
			}
			disposed = true;
			unsubscribe?.();
			unsubscribe = undefined;
			stopWaiting?.();
			drain();
		},
		getLoadedScriptIds() {
			return Array.from(loadedElements.keys());
		},
		updateScripts(next: Script[]) {
			if (disposed) {
				return;
			}
			pendingScripts = next;
			drain();
		},
	};
	if (options.registry && registryState.status === 'pending') {
		const settle = (state: ScriptRegistryState): void => {
			if (state.status === 'pending' || registryState.status !== 'pending') {
				return;
			}
			registryState = state;
			stopWaiting?.();
			// Before the waiting scripts mount, so their loaders find it.
			pinFiles(state);
			if (disposed || (held.length === 0 && !staged)) {
				return;
			}
			// Resolve the list again: waiting scripts mount now, from the
			// registry's source or their own URL.
			pendingScripts ??= configured;
			try {
				drain();
			} catch (error) {
				emit({
					action: 'error',
					message: `Applying the script registry's list failed: ${error instanceof Error ? error.message : String(error)}`,
					scope: 'phase',
					scriptId: '',
					source: 'script-loader',
					timestamp: Date.now(),
				});
			}
		};
		const offSnapshot = kernel.subscribe((snapshot) => {
			settle(readRegistry(snapshot));
		});
		stopWaiting = () => {
			offSnapshot();
			stopWaiting = undefined;
		};
	}
	try {
		pinFiles(registryState);
		// Observe initial mounts too, including synchronous inline execution.
		reconcileRequested = true;
		forceReconcile = true;
		drain();
	} catch (error) {
		handle.dispose();
		throw error;
	}
	return handle;
};
