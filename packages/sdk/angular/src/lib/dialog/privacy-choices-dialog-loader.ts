/**
 * How `@inth/angular/consent-dialog` reaches the Privacy Choices (v6)
 * dialog. The dialog and the parts it shares with the v6 banner depend on
 * this entry's consent manager, so they cannot live in an entry of their
 * own that this one loads: ng-packagr rejects entry points that depend on
 * each other. They stay chunks of this entry instead, reached only through
 * dynamic imports, so a page on the classic design downloads none of them.
 *
 * @packageDocumentation
 * @internal
 */

import type { Type } from '@angular/core';

import type { PrivacyChoicesDialog } from '../privacy-choices/dialog/privacy-choices-dialog';

/**
 * Loads the Privacy Choices dialog, a chunk of its own with its stylesheets.
 *
 * @internal
 */
export const loadPrivacyChoicesDialog =
	async function loadPrivacyChoicesDialog(): Promise<
		Type<PrivacyChoicesDialog>
	> {
		return (await import('../privacy-choices/dialog/privacy-choices-dialog'))
			.PrivacyChoicesDialog;
	};
