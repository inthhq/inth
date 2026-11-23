import { stylesheet } from '../generated/iab-styles';
import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../types';
import { mountConsentUI } from '../ui/mount';
import { adapterStyles } from './styles';
import { createIABSurface } from './surface';

/**
 * Mount IAB UI alongside the ordinary UI for non-IAB policy regions.
 * @returns The shared UI host and its teardown.
 */
export const mountIABConsentUI = (
	client: ConsentClient,
	options: ConsentUIOptions = {}
): ConsentUIHandle =>
	mountConsentUI(client, options, {
		createSurfaces: (ctx) => [createIABSurface(ctx, options)],
		stylesheet: `${stylesheet}\n${adapterStyles}`,
	});
