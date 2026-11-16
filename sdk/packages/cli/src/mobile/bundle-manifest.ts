import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
	exportMobilePolicy,
	ManifestUnreachableError,
} from './export-manifest';
import { resourceProblem } from './resource-check';

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
	/** Fetch over plain http from a loopback host, for a `dryRun` build. */
	allowLoopback?: boolean;
	testOnlyAllowLoopback?: boolean;
}

export type BundleManifestResult =
	| { status: 'fetched'; out: string; expiresAt: number }
	| { status: 'reused'; out: string; warning: string }
	| { status: 'skipped'; warning: string };

const DAY_MS = 86_400_000;
const DEFAULT_EXPIRY_DAYS = 30;

/**
 * The copy at `path`, if a native core would use it for this backend: the same
 * checks the export itself passes, so a reused copy is never one a device discards.
 */
const readLastCopy = async (
	path: string,
	backendUrl: string,
	now: number
): Promise<string | null> => {
	try {
		const text = await readFile(path, 'utf8');
		return resourceProblem(text, { endpoint: backendUrl, now }) === null
			? text
			: null;
	} catch {
		return null;
	}
};

/**
 * Fetch the latest manifest and write it for bundling.
 *
 * When the backend cannot be reached, `allowStaleManifest` reuses an intact copy
 * already at `out`. Otherwise a debug build warns and continues with no manifest,
 * removing any earlier copy at `out` so it cannot ship by accident, and a release
 * build throws, so no release ships without the manifest it was meant to carry.
 * A reachable backend whose manifest is refused fails every build.
 *
 * @throws {Error} for a refused manifest, and for a release build that could not
 * reach the backend and has no copy it was allowed to reuse.
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
			testOnlyAllowLoopback:
				options.allowLoopback === true || options.testOnlyAllowLoopback,
			vendors: options.vendors,
		});
		await mkdir(dirname(options.out), { recursive: true });
		const temporary = `${options.out}.tmp`;
		await writeFile(temporary, resource);
		await rename(temporary, options.out);
		return { expiresAt, out: options.out, status: 'fetched' };
	} catch (error) {
		if (!(error instanceof ManifestUnreachableError)) {
			throw error;
		}
		failure = error.message;
	}
	if (options.allowStaleManifest === true) {
		if ((await readLastCopy(options.out, backendUrl, now)) !== null) {
			return {
				out: options.out,
				status: 'reused',
				warning: `Could not fetch the manifest (${failure}). Reusing the last fetched copy at ${options.out}; devices report policyStale once it expires.`,
			};
		}
	}
	if (options.build === 'debug') {
		// Reusing an older copy is what allowStaleManifest is for; without it the
		// build carries no manifest rather than a stale one.
		await rm(options.out, { force: true });
		return {
			status: 'skipped',
			warning: `Could not fetch the manifest (${failure}). This debug build continues with no bundled manifest.`,
		};
	}
	throw new ManifestUnreachableError(
		`Could not fetch the manifest for this release build: ${failure}. ` +
			'Connect the build to the backend, or pass allowStaleManifest to reuse the last fetched copy.'
	);
};
