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
import { importChunk } from '@inth/sdk/runtime/import-chunk';

import type { ConsentDialogBody } from './dialog';

/**
 * Loads the dialog's body, a chunk of its own with its stylesheets. Each
 * call imports the chunk again, so the next open after a failed download
 * fetches it again (`importChunk`).
 *
 * @internal
 */
export const loadConsentDialogBody = function loadConsentDialogBody(): Promise<
	Type<ConsentDialogBody>
> {
	return importChunk(
		() => import('./dialog'),
		(module) =>
			typeof module.ConsentDialogBody === 'function'
				? module.ConsentDialogBody
				: undefined
	);
};
