import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../consent-client.model';
import { stylesheet } from '../generated/iab-styles';
import { mountConsentUI } from '../ui/mount-consent-ui';
import { createIABSurface } from './create-iab-surface';
import { adapterStyles } from './iab-adapter-styles.model';

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
