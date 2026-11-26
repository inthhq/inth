/**
 * The `scriptRegistry.load` list the Inth server would send for a project
 * that added every integration in `@inth/integrations/remote`, built with
 * the same calls the server makes: sample dashboard options, then
 * `validateRemoteOptions`, `resolveRemote` and `manifestLevel`.
 *
 * It imports the built package by path: `@inth/integrations` depends on
 * `@inth/sdk`, whose build includes this package's, so this package cannot
 * list it as a dependency. The browser tests import only its types.
 */
import { pathToFileURL } from 'node:url';

/** The parts of `@inth/integrations/remote` the Inth server calls. */
interface RemoteModule {
	manifestLevel: (manifest: Record<string, unknown>) => number;
	remoteIntegrations: Readonly<
		Record<
			string,
			{
				key: string;
				label: string;
				options: Readonly<Record<string, OptionSpec>>;
				resolveRemote: (
					options: Readonly<Record<string, unknown>>
				) => Record<string, unknown>;
			}
		>
	>;
	validateRemoteOptions: (
		key: string,
		input: unknown
	) =>
		| { ok: true; options: Record<string, unknown> }
		| { ok: false; issues: string[] };
}

type OptionSpec =
	| { kind: 'id' | 'hostname'; example: string }
	| { kind: 'number'; example: number }
	| { kind: 'enum'; default: string }
	| { kind: 'boolean'; default: boolean }
	| { kind: 'idList'; example: string }
	| { kind: 'map'; keyExample: string; values: readonly string[] }
	| { kind: 'object'; fields: Readonly<Record<string, OptionSpec>> };

/** One entry on `load`, as the Inth server sends it. */
export interface LoadEntry {
	id: string;
	integration: string;
	manifest: Record<string, unknown>;
}

/** What the test needs to know about each listed integration. */
export interface ListedIntegration extends LoadEntry {
	label: string;
	/** The level the server stamps into `requires` and filters on. */
	level: number;
	/** The options a dashboard saved, after validation. */
	options: Record<string, unknown>;
}

export interface RemoteIntegrationList {
	integrations: ListedIntegration[];
	/** Integrations the server could not build an entry for, and why. */
	unbuilt: { key: string; problem: string }[];
	/**
	 * The Zaraz purpose IDs the Cloudflare Zaraz entry maps, which a site's
	 * Zaraz dashboard defines. A page's Zaraz stand-in lists them, as Zaraz
	 * does, since the adapter sets only purposes Zaraz already has.
	 */
	zarazPurposes: string[];
}

/**
 * What a dashboard form saves when every field keeps its example or
 * default: each ID, hostname and number its example, each enum and boolean
 * its default, a list of the example ID, a map of the example key to the
 * first value and a second key to the last (so Zaraz maps one purpose that
 * a reject keeps and one it denies), and an object with every field set.
 */
const sampleValue = function sampleValue(spec: OptionSpec): unknown {
	switch (spec.kind) {
		case 'id':
		case 'hostname':
		case 'number': {
			return spec.example;
		}
		case 'enum':
		case 'boolean': {
			return spec.default;
		}
		case 'idList': {
			return [spec.example];
		}
		case 'map': {
			return spec.values.length > 1
				? {
						[spec.keyExample]: spec.values[0],
						[`${spec.keyExample}2`]: spec.values.at(-1),
					}
				: { [spec.keyExample]: spec.values[0] };
		}
		case 'object': {
			return Object.fromEntries(
				Object.entries(spec.fields).map(([name, field]) => [
					name,
					sampleValue(field),
				])
			);
		}
		default: {
			throw new Error(`unknown option kind in ${JSON.stringify(spec)}`);
		}
	}
};

const zarazPurposeIds = (integrations: ListedIntegration[]): string[] => {
	const entry = integrations.find(
		({ integration }) => integration === 'cloudflareZaraz'
	);
	const { adapter } = (entry?.manifest ?? {}) as {
		adapter?: { options?: { purposes?: Record<string, string[]> } };
	};
	return Object.values(adapter?.options?.purposes ?? {}).flat();
};

const build = async function build(
	integrationsDist: string
): Promise<RemoteIntegrationList> {
	const remote = (await import(
		pathToFileURL(`${integrationsDist}/remote.js`).href
	)) as RemoteModule;
	const integrations: ListedIntegration[] = [];
	const unbuilt: RemoteIntegrationList['unbuilt'] = [];
	for (const integration of Object.values(remote.remoteIntegrations)) {
		const saved = Object.fromEntries(
			Object.entries(integration.options).map(([name, spec]) => [
				name,
				sampleValue(spec),
			])
		);
		const checked = remote.validateRemoteOptions(integration.key, saved);
		if (!checked.ok) {
			unbuilt.push({
				key: integration.key,
				problem: `validateRemoteOptions refused the sample options: ${checked.issues.join('; ')}`,
			});
			continue;
		}
		let manifest: Record<string, unknown>;
		try {
			manifest = integration.resolveRemote(checked.options);
		} catch (error) {
			unbuilt.push({
				key: integration.key,
				problem: `resolveRemote threw: ${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}
		const level = remote.manifestLevel(manifest);
		// A level 1 manifest carries no `requires`.
		const { requires: _stamped, ...rest } = manifest;
		const sent = level > 1 ? { ...rest, requires: level } : rest;
		integrations.push({
			id: String(manifest.vendor),
			integration: integration.key,
			label: integration.label,
			level,
			manifest: sent,
			options: checked.options,
		});
	}
	return {
		integrations,
		unbuilt,
		zarazPurposes: zarazPurposeIds(integrations),
	};
};

const built = new Map<string, Promise<RemoteIntegrationList>>();

/**
 * Every remote integration, built once per run from the `@inth/integrations`
 * build in `integrationsDist`.
 */
export const remoteIntegrationList = function remoteIntegrationList(
	integrationsDist: string
): Promise<RemoteIntegrationList> {
	let list = built.get(integrationsDist);
	if (!list) {
		list = build(integrationsDist);
		built.set(integrationsDist, list);
		// A missing build is reported each time, and tried again after a build.
		list.catch(() => built.delete(integrationsDist));
	}
	return list;
};

/**
 * The `load` list for a request at `manifestLevel`, as the Inth server
 * filters it: an entry above the request's level is left out. A request
 * without a level is level 1.
 */
export const loadForLevel = (
	list: RemoteIntegrationList,
	manifestLevel: number
): LoadEntry[] =>
	list.integrations
		.filter((entry) => entry.level <= manifestLevel)
		.map(({ id, integration, manifest }) => ({ id, integration, manifest }));
