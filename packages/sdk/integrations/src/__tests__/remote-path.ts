/**
 * Runs e2e scenarios through the path a remote integration takes in
 * production: the Inth server validates the saved options and resolves the
 * manifest, the manifest crosses the wire as JSON on
 * `scriptRegistry.load`, and the SDK's script loader, with remote scripts on,
 * reads the entry, declares its category and vendor, loads the manifest
 * runtime and builds the script.
 */
import type { createConsentKernel, Script } from '@inth/sdk/engine';
import { MANIFEST_RUNTIME_LEVEL } from '@inth/sdk/manifest-runtime';
import type {
	ScriptLoaderDebugEvent,
	ScriptLoaderOptions,
} from '@inth/sdk/modules/script-loader';
import { loadManifestRuntime } from '@inth/sdk/runtime';

import type { BuiltInScriptIntegrationKey } from '../registry';
import { remoteIntegrations, validateRemoteOptions } from '../remote';

type KernelConfig = NonNullable<Parameters<typeof createConsentKernel>[0]>;

/** One `scriptRegistry.load` entry as the Inth server sends it. */
export type RemoteLoadEntry = NonNullable<
	NonNullable<KernelConfig['initialScriptRegistry']>['load']
>[number];

const ENTRY = Symbol('remote load entry');

type RemoteStandIn = Script & { [ENTRY]: RemoteLoadEntry };

/**
 * A stand-in for the script the server lists for `options`. Pass it where a
 * scenario passes scripts; `splitRemote` turns it into its `load` entry.
 * The real script exists only once the loader builds it, so a scenario that
 * reads the returned object reads only its `id` (the manifest's vendor) and
 * its category.
 */
export const fromRemote = function fromRemote<TOptions>(
	key: BuiltInScriptIntegrationKey,
	options: TOptions
): Script {
	const integration = remoteIntegrations[key];
	if (integration === undefined) {
		throw new Error(`${key} has no remote definition`);
	}
	const validated = validateRemoteOptions(key, options);
	if (!validated.ok) {
		throw new Error(
			`A dashboard cannot save these options: ${validated.issues.join('; ')}`
		);
	}
	const manifest = JSON.parse(
		JSON.stringify(integration.resolveRemote(validated.options))
	) as RemoteLoadEntry['manifest'];
	const id = String(manifest.vendor);
	const standIn: RemoteStandIn = {
		[ENTRY]: { id, integration: key, manifest },
		category: manifest.category as Script['category'],
		id,
	};
	return standIn;
};

/**
 * `[label, build]` rows for `describe.each`: the npm helper, then the same
 * options through the server's `load` list. Use it only for scenarios whose
 * options a dashboard can set; `fromRemote` throws for any other.
 */
export const npmAndRemote = function npmAndRemote<TOptions>(
	key: BuiltInScriptIntegrationKey,
	helper: (options: TOptions) => Script
): [string, (options: TOptions) => Script][] {
	return [
		['npm helper', helper],
		['remote manifest', (options) => fromRemote(key, options)],
	];
};

/**
 * Splits `scripts` into the scripts declared in code and the `load` list the
 * stand-ins came from. A spread copy of a stand-in keeps its entry, and any
 * `id` it was given is ignored: the server's entry id is the vendor.
 */
export const splitRemote = function splitRemote(scripts: readonly Script[]): {
	code: Script[];
	load: RemoteLoadEntry[];
} {
	const code: Script[] = [];
	const load: RemoteLoadEntry[] = [];
	for (const script of scripts) {
		const entry = (script as Partial<RemoteStandIn>)[ENTRY];
		if (entry === undefined) {
			code.push(script);
		} else {
			load.push(entry);
		}
	}
	return { code, load };
};

let runtimeLoad: Promise<unknown> | undefined;
/** Remote entries the loader refused or skipped, so a scenario fails. */
let refused: string[] = [];

const REMOTE_PROBLEM =
	/^(?:The Inth server sent|Remote script|The manifest runtime for remote scripts)/u;

/**
 * The loader's `onDebug`: records a remote entry it refused, which would
 * otherwise pass a scenario that expects nothing to load.
 */
export const onRemoteDebug = function onRemoteDebug(
	event: ScriptLoaderDebugEvent
): void {
	if (
		(event.action === 'error' || event.action === 'skipped') &&
		REMOTE_PROBLEM.test(event.message)
	) {
		refused.push(event.message);
	}
};

/**
 * What the runtime's `prepare` is loading, such as the level 3 part or an
 * adapter.
 */
let preparing: Promise<unknown>[] = [];

type ManifestRuntime = Awaited<ReturnType<typeof loadManifestRuntime>>;

/** `runtime`, with each `prepare` it starts recorded for `settleRemote`. */
const tracked = (runtime: ManifestRuntime): ManifestRuntime => {
	const { prepare } = runtime;
	return prepare
		? {
				...runtime,
				prepare: (manifests) => {
					const pending = prepare(manifests)?.then((moved) =>
						moved ? tracked(moved) : moved
					);
					if (pending) {
						preparing.push(pending);
					}
					return pending;
				},
			}
		: runtime;
};

/** The loader's `remote` option, as `remoteScripts: true` builds it. */
export const remoteLoaderOption: NonNullable<ScriptLoaderOptions['remote']> = {
	level: MANIFEST_RUNTIME_LEVEL,
	loadRuntime: () => {
		const load = loadManifestRuntime().then(tracked);
		runtimeLoad = load;
		return load;
	},
};

/** Waits for each `prepare`, and any a settled one started, then a tick. */
const settlePreparing = async (): Promise<void> => {
	if (preparing.length === 0) {
		return;
	}
	const pending = preparing;
	preparing = [];
	await Promise.allSettled(pending);
	// The loader awaited each one first, so it has built what it prepared.
	await Promise.resolve();
	await settlePreparing();
};

/**
 * Waits until a loader that started loading the manifest runtime has built
 * its remote scripts, including ones that waited for the level 3 part or
 * an adapter. Resolves at once for a scenario with none.
 */
export const settleRemote = async function settleRemote(): Promise<void> {
	if (runtimeLoad !== undefined) {
		await runtimeLoad;
		// The loader awaited the same promise first, so its scripts are built,
		// unless it is loading what they need first.
		await Promise.resolve();
		await settlePreparing();
	}
	if (refused.length > 0) {
		throw new Error(`The loader refused a remote script: ${refused.join(' ')}`);
	}
};

/** Forgets the runtime load of a finished scenario. */
export const resetRemote = function resetRemote(): void {
	runtimeLoad = undefined;
	preparing = [];
	refused = [];
};
