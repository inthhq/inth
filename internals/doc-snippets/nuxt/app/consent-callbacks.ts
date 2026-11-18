// #region docs:callbacks title="app/consent-callbacks.ts"
import type { InthNuxtConfig } from '@inth/nuxt';

export const callbacks = {
	// The visitor clicked Accept all, Reject all or Save.
	onChoiceRecorded: ({ snapshot }) => {
		console.info('Choice recorded', snapshot.explicitChoice);
	},
	onError: ({ error }) => {
		console.error('inth', error);
	},
	// Permissions changed for any reason: a choice, an expired choice, a new
	// policy or a privacy signal.
	onPermissionsChanged: ({ previous, snapshot }) => {
		console.info('Permissions', previous, snapshot.effectivePermissions);
	},
} satisfies NonNullable<InthNuxtConfig['callbacks']>;
// #endregion docs:callbacks
