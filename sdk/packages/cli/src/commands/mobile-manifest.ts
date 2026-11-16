import { resolve } from 'node:path';

import type { CliContext } from '../context/types';
import { CliError } from '../core/errors';
import { bundleMobileManifest } from '../mobile/bundle-manifest';
import type { BundleManifestResult } from '../mobile/bundle-manifest';
import { ManifestUnreachableError } from '../mobile/export-manifest';
import { normalizeProjectURL, ProjectURLError } from '../mobile/project-url';

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const list = (value: unknown): string[] | undefined =>
	text(value)
		?.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

/**
 * The project URL in its normal form, which is also what native code computes
 * from the same input and compares the bundled manifest's endpoint with.
 */
const readBackendURL = (value: string, dryRun: boolean): string => {
	try {
		return normalizeProjectURL(value, {
			option: '--backend-url',
			relaxed: dryRun,
		});
	} catch (error) {
		if (error instanceof ProjectURLError) {
			throw new CliError('FLAG_INVALID', {
				details: dryRun
					? error.message
					: `${error.message} Pass --dry-run when the app is built with dryRun.`,
				reason: error.reason,
			});
		}
		throw error;
	}
};

/**
 * `c15t mobile-manifest`: fetch the hosted manifest and write it for a native build.
 *
 * `--dry-run` says the app is built with `dryRun`, so `--backend-url` takes the
 * relaxed rule: any https URL, or http on a loopback host.
 */
export const mobileManifest = async (
	context: CliContext,
	run = bundleMobileManifest
): Promise<BundleManifestResult> => {
	const given = text(context.flags['backend-url']);
	if (given === undefined) {
		throw new CliError('INPUT_REQUIRED', {
			details:
				'Pass --backend-url https://your-project.inth.app, the same URL the app uses.',
		});
	}
	const dryRun = context.flags['dry-run'] === true;
	const backendUrl = readBackendURL(given, dryRun);
	const build = text(context.flags.build) ?? 'release';
	if (build !== 'release' && build !== 'debug') {
		throw new CliError('FLAG_INVALID', {
			details: '--build must be release or debug.',
		});
	}
	const days = text(context.flags['expires-in-days']);
	const vendors = list(context.flags.vendors)?.map(Number);
	if (vendors?.some((id) => !Number.isInteger(id) || id <= 0)) {
		throw new CliError('FLAG_INVALID', {
			details: '--vendors takes comma-separated positive vendor ids.',
		});
	}
	try {
		const result = await run({
			// A dryRun build may point at a loopback backend over plain http.
			allowLoopback: dryRun,
			allowStaleManifest: context.flags['allow-stale-manifest'] === true,
			backendUrl,
			build,
			expiresInDays: days === undefined ? undefined : Number(days),
			languages: list(context.flags.languages),
			out: resolve(context.cwd, text(context.flags.out) ?? 'c15t-policy.json'),
			vendors,
		});
		if (result.status === 'fetched') {
			context.logger.success(`Wrote ${result.out}`);
		} else {
			context.logger.warn(result.warning);
		}
		return result;
	} catch (error) {
		// A backend that answered with a manifest the exporter refuses is a
		// configuration problem, not a connection problem.
		throw new CliError(
			error instanceof ManifestUnreachableError ? 'NETWORK_ERROR' : 'API_ERROR',
			{ details: error instanceof Error ? error.message : String(error) }
		);
	}
};
