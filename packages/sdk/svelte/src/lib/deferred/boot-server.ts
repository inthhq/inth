/**
 * Server side of `ConsentRoot`'s deferred engine: whether the browser may
 * render this visitor from the server's snapshot and load the consent
 * engine after the page, and the boot data that carries the snapshot.
 * Only the server render reaches it.
 *
 * @packageDocumentation
 * @internal
 */

import { defaultTranslationConfig } from '@inth/sdk/engine';
import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { ConsentProviderRuntime } from '@inth/sdk/runtime/provider';
import { canDeferEngine } from '@inth/sdk/server';
import { deepMergeTranslations } from '@inth/sdk/translations';
import type { Translations } from '@inth/sdk/translations';

import type { ProviderOptionsInput } from '../provider-options';
import { bootMarkup } from './boot';
import type { ConsentRootBoot } from './boot';

/**
 * The snapshot's copy with every key the English defaults have, so the
 * browser's surfaces read a complete bundle before `ConsentRoot`'s engine
 * loads. An English bundle comes back unchanged. The IAB copy is left
 * out: the IAB surfaces fill it from English themselves.
 *
 * @internal
 */
export const withCompleteTranslations = function withCompleteTranslations(
	snapshot: ConsentSnapshot
): ConsentSnapshot {
	const { iab: _iab, ...english } = defaultTranslationConfig.translations
		.en as Translations;
	const resolved = snapshot.translations;
	return {
		...snapshot,
		translations: {
			...resolved,
			language: resolved?.language ?? 'en',
			translations: deepMergeTranslations(
				english as Translations,
				(resolved?.translations ?? {}) as Partial<Translations>
			) as NonNullable<ConsentSnapshot['translations']>['translations'],
		},
	};
};

/** What the server render of `ConsentRoot` leaves for the browser. */
export interface ServerBoot {
	/** The markup to render after the root's children. */
	html: string;
	/** Whether the browser may load the engine after the page. */
	defer: boolean;
}

/**
 * The boot data for a server render of `ConsentRoot`.
 *
 * @param runtime - The server's runtime, not started.
 * @param options - The root's options, with its `prefetch`.
 * @internal
 */
export const planServerBoot = function planServerBoot(
	runtime: ConsentProviderRuntime,
	options: ProviderOptionsInput
): ServerBoot {
	const snapshot = runtime.kernel.getServerSnapshot();
	const defer = canDeferEngine(snapshot, options);
	const boot: ConsentRootBoot = { s: withCompleteTranslations(snapshot) };
	if (defer) {
		boot.d = 1;
	}
	if (runtime.experiment) {
		boot.x = runtime.experiment;
	}
	// The vendor list can be large, and the page's state already holds it.
	const gvl = options.prefetch?.initialIab?.gvl;
	if (gvl && snapshot.iab?.gvl === gvl) {
		boot.s = { ...boot.s, iab: { ...snapshot.iab, gvl: null } };
		boot.g = 1;
	}
	return {
		defer,
		html: bootMarkup(JSON.stringify(boot).replaceAll('<', '\\u003c')),
	};
};
