// #region docs:consent-callbacks
import type { InthCallbacks } from '@inth/angular';

// Pass as `callbacks` to provideInth() in app.config.ts.
export const callbacks: InthCallbacks = {
	// Runs just before Inth reloads the page after a withdrawal.
	onBeforeConsentRevocationReload: ({ preferences }) => {
		console.info('Reloading with', preferences);
	},
	// An explicit accept, reject or save. Never runs for defaults, expiry,
	// policy changes or privacy signals.
	onChoiceRecorded: ({ snapshot, confirmed }) => {
		console.info('Visitor chose', snapshot.explicitChoice, confirmed);
	},
	// A failed command, such as an /init request that could not reach the
	// backend.
	onError: ({ error }) => {
		console.warn('inth error', error);
	},
	// Any change to what may run, whatever caused it.
	onPermissionsChanged: ({ snapshot, previous }) => {
		console.info('Permissions', previous, '->', snapshot.effectivePermissions);
	},
	// The banner or dialog became visible: count impressions here.
	onSurfaceShown: ({ surface }) => {
		console.info('Shown', surface);
	},
};
// #endregion docs:consent-callbacks
