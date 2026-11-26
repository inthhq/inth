import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

/**
 * Promptwatch vendor manifest.
 *
 * Loads the Promptwatch client with your project id on the script element.
 */
export const promptwatchManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			async: true,
			attributes: {
				'data-project-id': '{{projectId}}',
			},

			src: 'https://ingest.promptwatch.com/js/client.min.js',
			type: 'loadScript',
		},
	],
	vendor: 'promptwatch',
	vendorDetails: {
		homepageUrl: 'https://promptwatch.com/',
		legalName: 'Promptwatch B.V.',
		name: 'Promptwatch',
		privacyPolicyUrl: 'https://promptwatch.com/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface PromptwatchOptions {
	/** Your Promptwatch project id (UUID from the Promptwatch dashboard). */
	projectId: string;
	/** Promptwatch client script URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link promptwatch}.
 */
export const resolvePromptwatchManifest = function resolvePromptwatchManifest({
	projectId,
}: Omit<PromptwatchOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(promptwatchManifest, { projectId });
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'promptwatch',
		{
			projectId: {
				example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
				kind: 'id',
				label: 'Project ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolvePromptwatchManifest
	);

/**
 * Promptwatch analytics script for AI traffic and usage insights.
 *
 * @remarks When `projectId` is missing or blank, the helper logs
 *   `promptwatch: missing or invalid projectId` with `console.error` and
 *   returns a script that never loads.
 */
export const promptwatch = function promptwatch({
	projectId,
	scriptUrl,
}: PromptwatchOptions): Script {
	const normalizedProjectId = readId(projectId);
	if (normalizedProjectId === undefined) {
		return skipMissingId('promptwatch', 'projectId', {
			category: 'measurement',
			manifest: promptwatchManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolvePromptwatchManifest({ projectId: normalizedProjectId })
		),
		scriptUrl
	);
};
