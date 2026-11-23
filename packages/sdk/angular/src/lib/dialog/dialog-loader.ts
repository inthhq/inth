/**
 * How `@inth/angular/consent-dialog` reaches the dialog's body. The body
 * and the parts it shares with the prompt depend on this entry's consent
 * manager, so they cannot live in an entry of their own that this one
 * loads: ng-packagr rejects entry points that depend on each other. They
 * stay chunks of this entry instead, reached only through dynamic imports,
 * so a page loads them only when the dialog opens or warms.
 *
 * @packageDocumentation
 * @internal
 */

import type { Type } from '@angular/core';

import type { ConsentDialogBody } from './dialog';

/**
 * Loads the dialog's body, a chunk of its own with its stylesheets.
 *
 * @internal
 */
export const loadConsentDialogBody =
	async function loadConsentDialogBody(): Promise<Type<ConsentDialogBody>> {
		return (await import('./dialog')).ConsentDialogBody;
	};
