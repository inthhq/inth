'use client';

/**
 * `OptOutConfirmation` whose wrapper loads with a deferred root's engine.
 * Kept in its own module so routes that only import `ConsentBanner` and
 * `ConsentDialog` do not fetch it on first load.
 *
 * @packageDocumentation
 * @internal
 */

import { importChunk } from '@inth/sdk/runtime/import-chunk';

import type * as DialogModuleNamespace from '../aggregate-components';
import type { OptOutConfirmationCompoundComponent } from '../components/opt-out-confirmation';
import { surfaceWithParts } from './surface-with-parts';

type DialogModule = typeof DialogModuleNamespace;

/**
 * `OptOutConfirmation` whose wrapper loads with a deferred root's engine.
 *
 * @internal
 */
export const DeferredOptOutConfirmation = surfaceWithParts(
	'OptOutConfirmation',
	(): Promise<DialogModule> =>
		importChunk(
			() => import('../aggregate-components'),
			(module) =>
				typeof module.OptOutConfirmation === 'function' ? module : undefined
		),
	(module) => module.OptOutConfirmation,
	[
		'Card',
		'Description',
		'DoneButton',
		'Footer',
		'Header',
		'Overlay',
		'PreferencesLink',
		'Root',
		'Status',
		'Title',
	]
) as OptOutConfirmationCompoundComponent;
