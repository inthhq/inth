import type { Script } from '@inth/sdk/engine';

import { compileManifest } from './engine/compile';
import { resolvedManifestToScript } from './engine/runtime';
import type { ResolvedManifest, VendorManifest } from './types';

const manifestCache = new WeakMap<
	VendorManifest,
	Map<string, ResolvedManifest>
>();

/**
 * The cache key for `value`, or `undefined` when it holds anything but plain
 * data: primitives, arrays and objects whose prototype is `Object.prototype`
 * or `null`. A `Date`, a function or a class instance has no key, because
 * two that read differently can serialize the same.
 */
const serializeConfigValue = function serializeConfigValue(
	value: unknown
): string | undefined {
	if (value === undefined) {
		return 'undefined';
	}

	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => serializeConfigValue(item));
		return items.includes(undefined) ? undefined : `[${items.join(',')}]`;
	}

	if (typeof value === 'object') {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			return undefined;
		}
		// The key only needs a stable order. `localeCompare` would load the ICU
		// collator on the first vendor helper call of a page.
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([left], [right]) => (left < right ? -1 : 1)
		);
		const parts: string[] = [];
		for (const [key, nestedValue] of entries) {
			const nested = serializeConfigValue(nestedValue);
			if (nested === undefined) {
				return undefined;
			}
			parts.push(`${JSON.stringify(key)}:${nested}`);
		}
		return `{${parts.join(',')}}`;
	}

	if (typeof value === 'function' || typeof value === 'symbol') {
		return undefined;
	}

	return `${typeof value}:${String(value)}`;
};

/**
 * Compiles a `VendorManifest` + config into its serializable
 * `ResolvedManifest`. Repeated calls with the same manifest object and an
 * equal config of plain data return the same cached object, so callers must
 * not mutate it.
 */
export const getCompiledManifest = function getCompiledManifest(
	manifest: VendorManifest,
	config: Record<string, unknown>
): ResolvedManifest {
	const cacheKey = serializeConfigValue(config);
	if (cacheKey === undefined) {
		return compileManifest(manifest, config);
	}
	let configCache = manifestCache.get(manifest);

	if (!configCache) {
		configCache = new Map<string, ResolvedManifest>();
		manifestCache.set(manifest, configCache);
	}

	const cached = configCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const compiled = compileManifest(manifest, config);
	configCache.set(cacheKey, compiled);

	return compiled;
};

/**
 * Compiles a `VendorManifest` + config into a `Script` object.
 */
export const resolveManifest = function resolveManifest(
	manifest: VendorManifest,
	config: Record<string, unknown> = {}
): Script {
	return resolvedManifestToScript(getCompiledManifest(manifest, config));
};
