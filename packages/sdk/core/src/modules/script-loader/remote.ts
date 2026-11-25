import type { Script } from '../../libs/script-loader/types';
/**
 * Scripts the Inth server sends on `scriptRegistry.load`, read before the
 * manifest runtime that runs them has loaded.
 */
import { isCategoryCondition } from './category-condition';

/** One `load` entry with the shape the loader can use. */
export interface RemoteEntry {
	/** Vendor slug: the manifest's `vendor` and the script's `id`. */
	id: string;
	/** `@inth/integrations` registry key, for messages. */
	integration: string;
	/** The resolved manifest, still unchecked. */
	manifest: Readonly<Record<string, unknown>>;
}

/** A `load` entry the loader skips, and why. */
export interface RemoteEntryProblem {
	id: string;
	message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The usable entries of `load`: a string `id`, an `integration`, and an
 * object `manifest` whose `vendor` is the `id`. A second entry with the
 * same `id` is skipped. Anything else is reported, not thrown.
 */
export const readRemoteEntries = function readRemoteEntries(load: unknown): {
	entries: RemoteEntry[];
	problems: RemoteEntryProblem[];
} {
	const entries: RemoteEntry[] = [];
	const problems: RemoteEntryProblem[] = [];
	if (!Array.isArray(load)) {
		return { entries, problems };
	}
	const seen = new Set<string>();
	for (const entry of load) {
		const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : '';
		if (
			!(
				isRecord(entry) &&
				id &&
				typeof entry.integration === 'string' &&
				isRecord(entry.manifest)
			)
		) {
			problems.push({
				id,
				message: `The Inth server sent a remote script without an id, an integration and a manifest, so it does not load.`,
			});
			continue;
		}
		if (!isCategoryCondition(entry.manifest.category)) {
			problems.push({
				id,
				message: `The Inth server sent remote script ${id} with a category Inth does not know, so it does not load.`,
			});
			continue;
		}
		if (entry.manifest.vendor !== id) {
			problems.push({
				id,
				message: `The Inth server sent remote script ${id} with a manifest for ${String(entry.manifest.vendor)}, so it does not load.`,
			});
			continue;
		}
		if (seen.has(id)) {
			problems.push({
				id,
				message: `The Inth server sent remote script ${id} twice; only the first loads.`,
			});
			continue;
		}
		seen.add(id);
		entries.push({
			id,
			integration: entry.integration,
			manifest: entry.manifest,
		});
	}
	return { entries, problems };
};

/**
 * What a remote entry declares before its manifest runs: its consent
 * category, and its vendor for the preference dialog. A stand-in `Script`
 * that only feeds category registration and vendor declarations; it is
 * never mounted.
 */
export const remoteDeclaration = function remoteDeclaration(
	entry: RemoteEntry
): Script {
	const { category, vendorDetails } = entry.manifest;
	const details =
		isRecord(vendorDetails) &&
		typeof vendorDetails.name === 'string' &&
		typeof vendorDetails.privacyPolicyUrl === 'string'
			? (vendorDetails as unknown as Script['vendorDetails'])
			: undefined;
	const declaration: Script = {
		callbackOnly: true,
		category: category as Script['category'],
		id: entry.id,
		vendor: entry.id,
	};
	if (details) {
		declaration.vendorDetails = details;
	}
	return declaration;
};

/**
 * The key a script declared in code claims, so a remote entry for the same
 * integration is skipped: its `integration`, else its `vendor`, else its
 * `id`.
 */
export const codeScriptKey = (script: Script): string =>
	script.integration ?? script.vendor ?? script.id;
