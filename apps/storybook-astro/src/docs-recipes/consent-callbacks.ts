// #region docs:callbacks title="src/consent-callbacks.ts"
import type { InthClientOptionsExtension } from '@inth/astro';

export const callbacks: InthClientOptionsExtension['callbacks'] = {
	// Runs when the visitor selects accept, reject or save.
	onChoiceRecorded: ({ snapshot }) => {
		document.dispatchEvent(
			new CustomEvent('consent:choice', { detail: snapshot.explicitChoice })
		);
	},
	// Runs whenever a permission changes, whatever the cause.
	onPermissionsChanged: ({ previous, snapshot }) => {
		document.dispatchEvent(
			new CustomEvent('consent:permissions', {
				detail: { current: snapshot.effectivePermissions, previous },
			})
		);
	},
};
// #endregion docs:callbacks
