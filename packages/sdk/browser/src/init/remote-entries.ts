/**
 * The scripts the Inth server lists on `scriptRegistry.load`, as the init
 * script reads them before the engine: what each declares, not what it
 * runs. The engine's script loader checks and runs the manifests.
 *
 * @packageDocumentation
 * @internal
 */

import type { AllConsentNames, Script } from '@inth/sdk-core';
import type { SSRInitialData } from '@inth/sdk-core/runtime/deferred-snapshot';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

// The names of `allConsentNames`, inlined to keep the core entry out of
// `inth.js`.
const CATEGORY_NAMES: ReadonlySet<string> = new Set([
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
]);

/**
 * The category names in `condition`, or `null` when it is not a condition
 * over known categories. The same rule as the engine's loader, which
 * refuses such an entry.
 */
const conditionCategories = (
	condition: unknown,
	depth = 0
): AllConsentNames[] | null => {
	if (typeof condition === 'string') {
		return CATEGORY_NAMES.has(condition)
			? [condition as AllConsentNames]
			: null;
	}
	if (!isRecord(condition) || depth > 16) {
		return null;
	}
	const keys = Object.keys(condition);
	if (keys.length !== 1) {
		return null;
	}
	const [key] = keys;
	if (key === 'not') {
		return conditionCategories(condition.not, depth + 1);
	}
	const operands = condition[key as string];
	if (!(key === 'and' || key === 'or') || !Array.isArray(operands)) {
		return null;
	}
	const names: AllConsentNames[] = [];
	for (const operand of operands) {
		const nested = conditionCategories(operand, depth + 1);
		if (!nested) {
			return null;
		}
		names.push(...nested);
	}
	return operands.length > 0 ? names : null;
};

/** What the init script reads from the server's list. */
export interface RemoteStandIns {
	/**
	 * A callback-only stand-in per entry no code script claims, for deciding
	 * whether the engine must load now. Never mounted.
	 */
	scripts: Script[];
	/** Every category those entries ask for. */
	categories: AllConsentNames[];
}

/**
 * The entries of an init answer's `scriptRegistry.load` that the engine
 * would load: well formed, for a known category, and not claimed by a
 * script in `codeScripts` (by `integration ?? vendor ?? id`, or by `id`).
 */
export const readRemoteStandIns = function readRemoteStandIns(
	data: SSRInitialData | undefined,
	codeScripts: readonly Script[]
): RemoteStandIns {
	const load = (data?.init?.scriptRegistry as { load?: unknown } | undefined)
		?.load;
	const result: RemoteStandIns = { categories: [], scripts: [] };
	if (!Array.isArray(load)) {
		return result;
	}
	// The loader's rule: a code script claims its key and its `id`.
	const claimed = new Set(
		codeScripts.flatMap((script) => [
			script.integration ?? script.vendor ?? script.id,
			script.id,
		])
	);
	for (const entry of load) {
		const manifest = isRecord(entry) ? entry.manifest : undefined;
		const id = isRecord(entry) ? entry.id : undefined;
		const categories = isRecord(manifest)
			? conditionCategories(manifest.category)
			: null;
		if (
			typeof id !== 'string' ||
			!(isRecord(entry) && typeof entry.integration === 'string') ||
			!isRecord(manifest) ||
			manifest.vendor !== id ||
			!categories ||
			claimed.has(id)
		) {
			continue;
		}
		claimed.add(id);
		result.categories.push(...categories);
		result.scripts.push({
			alwaysLoad: manifest.alwaysLoad === true,
			callbackOnly: true,
			category: manifest.category as Script['category'],
			id,
			integration: id,
			vendor: id,
		});
	}
	return result;
};

/**
 * `data` with the registry `cached` carried in place of an
 * `{ unavailable: true }` one, so the engine starts from the last list
 * instead of none.
 */
export const withCachedRegistry = function withCachedRegistry(
	data: SSRInitialData | undefined,
	cached: SSRInitialData | undefined
): SSRInitialData | undefined {
	const registry = data?.init?.scriptRegistry;
	const fallback = cached?.init?.scriptRegistry;
	if (
		!(data?.init && registry?.unavailable === true) ||
		!fallback ||
		fallback.unavailable === true
	) {
		return data;
	}
	return { ...data, init: { ...data.init, scriptRegistry: fallback } };
};
