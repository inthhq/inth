import type { LoadScriptStep, VendorManifest } from '../../types';

/**
 * Optional tracking call inserted between the vendor init call and script load.
 */
interface QueuePixelInstallStep {
	/** Arguments passed to the vendor queue function. */
	args: unknown[];
}

export interface BuildQueuePixelInstallOptions {
	/** Global queue function to call, for example `rdt` or `snaptr`. */
	global: string;
	/** Arguments for the required initialization call. */
	initArgs: unknown[];
	/** Optional tracking command queued immediately after initialization. */
	trackStep?: QueuePixelInstallStep;
	/**
	 * The step that loads the vendor's script. Callers write it out so the
	 * script host stays a literal in the vendor file.
	 */
	loadScript: LoadScriptStep;
}

/**
 * Builds the common queue-pixel install sequence used by advertising pixels.
 */
export const buildQueuePixelInstall = function buildQueuePixelInstall({
	global,
	initArgs,
	trackStep,
	loadScript,
}: BuildQueuePixelInstallOptions): VendorManifest['install'] {
	const install: VendorManifest['install'] = [
		{
			args: initArgs,
			global,
			type: 'callGlobal',
		},
	];

	if (trackStep !== undefined) {
		install.push({
			args: trackStep.args,
			global,
			type: 'callGlobal',
		});
	}

	install.push(loadScript);

	return install;
};
