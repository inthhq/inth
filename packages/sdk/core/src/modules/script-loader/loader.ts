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
import { codeScriptKey, readRemoteEntries, remoteDeclaration } from './remote';
import type { RemoteEntry } from './remote';
import {
	createRegistryVerifier,
	isRegistrySignatureExpired,
} from './signature';
import { createScriptSourceResolver } from './sources';
import type {
	HeldScript,
	RegistryEntryCheck,
	ScriptRegistryState,
} from './sources';
import type {
	NormalizedScript,
	PendingMount,
	Script,
	ScriptCallbackInfo,
	ScriptLoaderHandle,
	ScriptLoaderOptions,
	ScriptLoaderDebugEvent,
	ScriptLoaderTools,
	RemoteManifestRuntime,
} from './types';

const MAX_RECONCILE_PASSES = 100;

/** Why the loader holds `script` back, for `onDebug`. */
const heldMessage = (reason: HeldScript['reason'], script: Script): string => {
	if (reason === 'unparsable') {
		return `scriptLoader.sources gives ${script.id} an integrity with no hash a browser can parse, so it does not load: the browser would run it unchecked.`;
	}
	if (reason === 'unsigned') {
		return `The script registry lists ${script.id} without a release signature Inth can verify, so it loads neither from the registry nor from ${script.src}.`;
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
	/** Scripts declared in code: `options.scripts`, then `updateScripts`. */
	let codeScripts: readonly Script[] = options.scripts;
	/** Entries of the last `load` list, whatever their runtime state. */
	let remoteEntries: RemoteEntry[] = [];
	/** Scripts built from `remoteEntries` once the runtime ran them. */
	let remoteScripts: Script[] = [];
	/** Every script built from a remote entry, so the resolver can tell. */
	const remoteObjects = new WeakSet<Script>();
	/** The remote scripts in the registered list, by id. */
	let activeRemote = new Map<string, Script>();
	/** Whether a code script claims a remote entry's integration. */
	/**
	 * What code scripts claim: each one's `integration ?? vendor ?? id`, and
	 * its `id`, so the merged list never holds two scripts with one id.
	 */
	const claimedByCode = (): Set<string> =>
		new Set(
			codeScripts.flatMap((script) => [codeScriptKey(script), script.id])
		);
	const registerCategories = (scripts: Script[]) => {
		// A remote entry declares its category and vendor from its JSON, before
		// its script is built, so a choice made meanwhile covers it.
		const claimed = claimedByCode();
		const all = [
			...scripts,
			...remoteEntries
				.filter((entry) => !claimed.has(entry.id))
				.map(remoteDeclaration),
		];
		kernel.set.registerConsentCategories(
			all.flatMap((script) => categoriesOf(script.category))
		);
		declareOwners(kernel, all, ownerSource);
	};
	/** The `load` list `remoteEntries` came from. */
	let lastLoad: unknown;
	const reportedRemote = new Set<string>();
	/**
	 * Report a remote entry the loader skips, once per list. Sent past the
	 * diagnostics, which describe the scripts that are registered.
	 */
	const reportRemote = (
		action: 'error' | 'skipped',
		scriptId: string,
		message: string
	): void => {
		const key = `${action}\u0000${scriptId}\u0000${message}`;
		if (reportedRemote.has(key)) {
			return;
		}
		reportedRemote.add(key);
		emitDebug({
			action,
			message,
			scope: 'lifecycle',
			scriptId,
			source: 'script-loader',
			timestamp: Date.now(),
		});
	};
	/** Read the snapshot's `load` list; `true` when it changed. */
	const readLoad = (snapshot: ConsentSnapshot): boolean => {
		const load = snapshot.scriptRegistry?.load;
		if (!options.remote || load === lastLoad) {
			return false;
		}
		lastLoad = load;
		reportedRemote.clear();
		const { entries, problems } = readRemoteEntries(load);
		for (const problem of problems) {
			reportRemote('error', problem.id, problem.message);
		}
		remoteEntries = entries;
		return true;
	};
	readLoad(kernel.getSnapshot());
	/**
	 * Apply a changed `load` list; set once the remote functions exist. The
	 * kernel subscriber calls it first, before it reconciles.
	 */
	let syncRemote = (_snapshot: ConsentSnapshot): void => undefined;
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
	/**
	 * Called when a signature check that held a script finishes; set to
	 * `resolveAgain` once the loader is built.
	 */
	let signatureSettled = (): void => undefined;
	const unsignedIds = new Set<string>();
	let verifyEntry: RegistryEntryCheck | undefined;
	if (options.registry) {
		const verifier = createRegistryVerifier({
			keys: options.registry.signingKeys ?? 'production',
			onSettled: () => {
				signatureSettled();
			},
			requireSignatures: options.registry.requireSignatures ?? false,
		});
		verifyEntry = (script, entry) => {
			const verdict = verifier(script.src ?? '', entry);
			const expired =
				!!entry.signature && isRegistrySignatureExpired(entry.signature);
			if (
				verdict === 'load' &&
				(!entry.signature || expired) &&
				!unsignedIds.has(script.id)
			) {
				unsignedIds.add(script.id);
				// Reported, not counted as a failure: the script loads.
				emitDebug({
					action: 'error',
					message: `The script registry lists ${script.id} with ${expired ? 'an expired' : 'no'} release signature. It loads from the registry on its integrity hash; set experimentalScriptRegistry.requireSignatures to refuse entries without a current one.`,
					scope: 'step',
					scriptId: script.id,
					source: 'script-loader',
					timestamp: Date.now(),
				});
			}
			return verdict;
		};
	}
	const withSources = createScriptSourceResolver(
		options.sources,
		options.registry ? () => registryState : undefined,
		verifyEntry,
		(script) => remoteObjects.has(script)
	);
	/** The list as given, so the registry's list can resolve it again. */
	let configured: readonly Script[] = options.scripts;
	/** Whether `configured` waits to replace the registered scripts. */
	let staged = false;
	/** Scripts registered for consent but not mounted; see `HeldScript`. */
	let held: HeldScript[] = [];
	const refusedIds = new Set<string>();
	/** When each script resolved from a signed registry entry stops being valid. */
	const signatureExpiry = new WeakMap<Script, number>();
	/** Resolve a list and keep what it holds back; returns what mounts. */
	const resolveSources = (scripts: readonly Script[]): Script[] => {
		const resolved = withSources(scripts);
		// Only a site that requires signatures refuses an expired one, so
		// only there must a script not mount past its expiry
		if (options.registry?.requireSignatures) {
			for (const [script, expiresAt] of resolved.expiresAt) {
				signatureExpiry.set(script, expiresAt);
			}
		}
		// A held script is checked once it resolves, against the URL it then
		// loads from, so it is not compared with its vendor URL meanwhile.
		validateScripts(resolved.scripts);
		({ held } = resolved);
		for (const { reason, script } of held) {
			if (reason === 'waiting' || refusedIds.has(script.id)) {
				continue;
			}
			refusedIds.add(script.id);
			emit({
				action: 'error',
				message: heldMessage(reason, script),
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
	/** Whether `script` is not mounted yet and its signature has expired. */
	const signatureExpiredBeforeMount = (script: Script): boolean => {
		const expiresAt = signatureExpiry.get(script);
		return (
			expiresAt !== undefined &&
			!loadedElements.has(script.id) &&
			!(Date.now() < expiresAt)
		);
	};
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
		// A script resolved while its signature was current may first mount
		// later, once consent arrives. Past the expiry the list is resolved
		// again before anything mounts, and the verifier holds it back
		if (
			normalized.some(
				(entry) =>
					signatureExpiredBeforeMount(entry.script) &&
					(entry.script.alwaysLoad === true || hasScriptConsent(entry, pass))
			)
		) {
			pendingScripts ??= configured;
			return;
		}
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
		const nextRemote = new Map(
			configuredNext
				.filter((script) => remoteObjects.has(script))
				.map((script) => [script.id, script])
		);
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
			// A script that moves between code and the Inth server's list
			// starts a fresh lifecycle, even when it loads the same file. A
			// server list that changes a running entry's manifest keeps it
			// running, as a helper rerendered with new options does: its new
			// category applies now, and the rest of its setup on the next page.
			if (
				replacement &&
				activeRemote.has(script.id) === nextRemote.has(script.id) &&
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
		activeRemote = nextRemote;
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
	unsubscribe = kernel.subscribe((snapshot) => {
		// A new `load` list replaces the remote scripts before anything
		// reconciles against this snapshot, here or in the registry's
		// subscriber below, so an entry the same answer removes never runs.
		syncRemote(snapshot);
		if (processing && isConsentStateUnchanged(kernel.getSnapshot())) {
			return;
		}
		// Revisit mounts skipped when a callback interrupts the active pass,
		// even if their eligibility is unchanged in the next snapshot.
		forceReconcile ||= processing;
		reconcileRequested = true;
		drain();
	});
	let runtime: RemoteManifestRuntime | undefined;
	let runtimeLoad: Promise<RemoteManifestRuntime> | undefined;
	/** The script each entry built, kept while its manifest is unchanged. */
	let built = new Map<string, { manifest: string; script: Script | null }>();
	/**
	 * The script to register for an entry whose manifest changed. Once the
	 * earlier script has started, it keeps running with its own setup and
	 * callbacks until the next page, as a rerendered npm helper does, and
	 * takes only the new category, so consent stays current. Before that,
	 * the new script.
	 */
	const keepStarted = (
		id: string,
		earlier: Script | null | undefined,
		fresh: Script
	): Script => {
		if (!earlier || !(loadedElements.has(id) || retainedElements.has(id))) {
			return fresh;
		}
		if (JSON.stringify(earlier.category) === JSON.stringify(fresh.category)) {
			return earlier;
		}
		const kept = { ...earlier, category: fresh.category };
		remoteObjects.add(kept);
		return kept;
	};
	const buildRemote = (loaded: RemoteManifestRuntime): Script[] => {
		const next = new Map<string, { manifest: string; script: Script | null }>();
		const scripts: Script[] = [];
		for (const entry of remoteEntries) {
			const manifest = JSON.stringify(entry.manifest);
			const cached = built.get(entry.id);
			let script: Script | null = null;
			if (cached?.manifest === manifest) {
				({ script } = cached);
			} else {
				const parsed = loaded.parseResolvedManifest(entry.manifest);
				if (parsed.ok) {
					const fresh = loaded.resolvedManifestToScript(parsed.manifest);
					remoteObjects.add(fresh);
					script = keepStarted(entry.id, cached?.script, fresh);
				} else {
					reportRemote(
						'error',
						entry.id,
						`Remote script ${entry.id} (${entry.integration}) does not load: ${parsed.reason}.`
					);
				}
			}
			next.set(entry.id, { manifest, script });
			if (script) {
				scripts.push(script);
			}
		}
		built = next;
		return scripts;
	};
	/** The code scripts, then each remote script no code script claims. */
	const mergedScripts = (): Script[] => {
		const claimed = claimedByCode();
		const merged = [...codeScripts];
		for (const script of remoteScripts) {
			if (claimed.has(script.id)) {
				reportRemote(
					'skipped',
					script.id,
					`Remote script ${script.id} does not load: a script in code loads ${script.id}, and code wins.`
				);
				continue;
			}
			merged.push(script);
		}
		return merged;
	};
	const setRemoteScripts = (scripts: Script[]): void => {
		if (disposed || (scripts.length === 0 && remoteScripts.length === 0)) {
			return;
		}
		remoteScripts = scripts;
		pendingScripts = mergedScripts();
		try {
			drain();
		} catch (error) {
			emit({
				action: 'error',
				message: `Applying the remote script list failed: ${error instanceof Error ? error.message : String(error)}`,
				scope: 'phase',
				scriptId: '',
				source: 'script-loader',
				timestamp: Date.now(),
			});
		}
	};
	const loadRemote = async (
		remote: NonNullable<ScriptLoaderOptions['remote']>,
		entries: RemoteEntry[]
	): Promise<void> => {
		try {
			runtimeLoad ??= remote.loadRuntime();
			runtime = await runtimeLoad;
		} catch (error) {
			runtimeLoad = undefined;
			reportRemote(
				'error',
				'',
				`The manifest runtime for remote scripts failed to load, so they do not load: ${error instanceof Error ? error.message : String(error)}`
			);
			return;
		}
		// A later list builds itself once the runtime is in.
		if (!disposed && remoteEntries === entries) {
			setRemoteScripts(buildRemote(runtime));
		}
	};
	/** Build the current entries, loading the runtime for the first one. */
	const applyRemote = (): void => {
		if (remoteEntries.length === 0 || !options.remote) {
			built = new Map();
			setRemoteScripts([]);
			return;
		}
		if (runtime) {
			setRemoteScripts(buildRemote(runtime));
			return;
		}
		void loadRemote(options.remote, remoteEntries);
	};
	syncRemote = (snapshot) => {
		if (!readLoad(snapshot)) {
			return;
		}
		// Replace the built scripts first: declaring a new entry's vendor
		// commits a snapshot of its own, and the reconcile it starts must not
		// see an entry this list removed.
		applyRemote();
		registerCategories([
			...normalized.map(({ script }) => script),
			...held.map(({ script }) => script),
		]);
	};

	const handle: ScriptLoaderHandle = {
		dispose() {
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
			const previous = codeScripts;
			codeScripts = next;
			pendingScripts = mergedScripts();
			try {
				drain();
			} catch (error) {
				// A list a check refused never registered, so a later remote
				// list merges with the code scripts that did.
				codeScripts = previous;
				throw error;
			}
		},
	};
	/**
	 * Resolve the configured list again, once the registry's list arrives
	 * or a signature check that held a script finishes.
	 */
	const resolveAgain = (): void => {
		if (disposed || (held.length === 0 && !staged)) {
			return;
		}
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
	signatureSettled = resolveAgain;
	if (options.registry && registryState.status === 'pending') {
		const settle = (state: ScriptRegistryState): void => {
			if (state.status === 'pending' || registryState.status !== 'pending') {
				return;
			}
			registryState = state;
			stopWaiting?.();
			// Waiting scripts mount now, from the registry's source or their
			// own URL, or wait on to have their signatures checked.
			resolveAgain();
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
		// Observe initial mounts too, including synchronous inline execution.
		reconcileRequested = true;
		forceReconcile = true;
		drain();
	} catch (error) {
		handle.dispose();
		throw error;
	}
	if (remoteEntries.length > 0) {
		applyRemote();
	}
	return handle;
};
