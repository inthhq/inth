import { resolve } from 'node:path';

import type { CliContext } from '../context/types';
import { CliError } from '../core/errors';
import { bundleMobileManifest } from '../mobile/bundle-manifest';
import type { BundleManifestResult } from '../mobile/bundle-manifest';
import { ManifestUnreachableError } from '../mobile/export-manifest';

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const list = (value: unknown): string[] | undefined =>
	text(value)
		?.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

/** `c15t mobile-manifest`: fetch the hosted manifest and write it for a native build. */
export const mobileManifest = async (
	context: CliContext,
	run = bundleMobileManifest
): Promise<BundleManifestResult> => {
	const backendUrl = text(context.flags['backend-url']);
	if (backendUrl === undefined) {
		throw new CliError('INPUT_REQUIRED', {
			details:
				'Pass --backend-url https://your-project.inth.app, the same URL the app uses.',
		});
	}
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
