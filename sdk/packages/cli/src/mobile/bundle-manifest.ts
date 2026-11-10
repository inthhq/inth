import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { exportMobilePolicy } from './export-manifest';

/** Release builds fail when the manifest fetch fails; debug builds warn and continue. */
export type ManifestBuild = 'release' | 'debug';

export interface BundleManifestOptions {
	backendUrl: string;
	/** Where the resource is written, and where the last fetched copy lives. */
	out: string;
	build: ManifestBuild;
	/** Reuse the last fetched copy at `out` when the fetch fails, as air-gapped CI needs. */
	allowStaleManifest?: boolean;
	/** Days until the bundled manifest is reported stale. Defaults to 30. */
	expiresInDays?: number;
	languages?: string[];
	vendors?: number[];
	now?: number;
	fetch?: typeof globalThis.fetch;
	testOnlyAllowLoopback?: boolean;
}

export type BundleManifestResult =
	| { status: 'fetched'; out: string; expiresAt: number }
	| { status: 'reused'; out: string; warning: string }
	| { status: 'skipped'; warning: string };

const DAY_MS = 86_400_000;
const DEFAULT_EXPIRY_DAYS = 30;

/** The copy at `path`, if it is an intact resource for this backend. */
const readLastCopy = async (
	path: string,
	backendUrl: string
): Promise<string | null> => {
	try {
		const text = await readFile(path, 'utf8');
		const wrapper = JSON.parse(text) as { payload?: unknown; sha256?: unknown };
		if (
			typeof wrapper.payload !== 'string' ||
			wrapper.sha256 !==
				createHash('sha256').update(wrapper.payload).digest('hex')
		) {
			return null;
		}
		const payload = JSON.parse(wrapper.payload) as {
			endpoint?: unknown;
			schemaVersion?: unknown;
		};
		return payload.schemaVersion === 1 && payload.endpoint === backendUrl
			? text
			: null;
	} catch {
		return null;
	}
};

/**
 * Fetch the latest manifest and write it for bundling.
 *
 * When the fetch fails, `allowStaleManifest` reuses an intact copy already at
 * `out`. Otherwise a debug build warns and continues without one, and a release
 * build throws, so no release ships without the manifest it was meant to carry.
 *
 * @throws {Error} for a release build whose fetch failed with no reusable copy.
 */
export const bundleMobileManifest = async (
	options: BundleManifestOptions
): Promise<BundleManifestResult> => {
	const backendUrl = options.backendUrl.replace(/\/+$/u, '');
	const now = options.now ?? Date.now();
	const days = options.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
	if (!Number.isFinite(days) || days <= 0) {
		throw new Error(
			'expiresInDays must be a number of days greater than zero.'
		);
	}
	const expiresAt = now + Math.round(days * DAY_MS);
	let failure: string;
	try {
		const resource = await exportMobilePolicy({
			endpoint: backendUrl,
			expiresAt,
			fetch: options.fetch,
			languages: options.languages,
			now,
			testOnlyAllowLoopback: options.testOnlyAllowLoopback,
			vendors: options.vendors,
		});
		await mkdir(dirname(options.out), { recursive: true });
		const temporary = `${options.out}.tmp`;
		await writeFile(temporary, resource);
		await rename(temporary, options.out);
		return { expiresAt, out: options.out, status: 'fetched' };
	} catch (error) {
		failure = error instanceof Error ? error.message : String(error);
	}
	if (options.allowStaleManifest === true) {
		if ((await readLastCopy(options.out, backendUrl)) !== null) {
			return {
				out: options.out,
				status: 'reused',
				warning: `Could not fetch the manifest (${failure}). Reusing the last fetched copy at ${options.out}; devices report policyStale once it expires.`,
			};
		}
	}
	if (options.build === 'debug') {
		return {
			status: 'skipped',
			warning: `Could not fetch the manifest (${failure}). This debug build continues without a fresh bundled manifest.`,
		};
	}
	throw new Error(
		`Could not fetch the manifest for this release build: ${failure}. ` +
			'Connect the build to the backend, or pass allowStaleManifest to reuse the last fetched copy.'
	);
};
