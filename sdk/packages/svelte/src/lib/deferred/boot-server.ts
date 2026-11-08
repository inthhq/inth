/**
 * Server side of `ConsentRoot`'s deferred engine: whether the browser may
 * render this visitor from the server's snapshot and load the consent
 * engine after the page, and the boot data that carries the snapshot.
 * Only the server render reaches it.
 *
 * @packageDocumentation
 * @internal
 */

import { defaultTranslationConfig } from '@c15t/core';
import type { ConsentSnapshot } from '@c15t/core';
import type { ConsentProviderRuntime } from '@c15t/core/runtime/provider';
import { planInstantCommit } from '@c15t/core/surface-actions/instant-commit';
import { deepMergeTranslations } from '@c15t/translations';
import type { Translations } from '@c15t/translations';

import { isIABConfigured } from '../iab-loader';
import type { ProviderOptionsInput } from '../provider-options';
import { bootMarkup } from './boot';
import type { ConsentRootBoot } from './boot';
import { isRunnableNow } from './scripts';

/**
 * Whether the browser may start this visitor from the server's snapshot
 * and load the engine after the page: the stock banner asks for a choice,
 * an accept and a reject are both something the first-load chunk can
 * record on its own (`planInstantCommit`), nothing optional is granted
 * yet, and no option needs the engine at once (IAB, an experiment, a
 * consent source, GPP, the network blocker, `enabled: false`,
 * `persistence: false`, or a configured script that may run now and the
 * server did not start). The same rule as `@c15t/vue`'s Nuxt module.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param options - The root's options.
 * @param now - The clock. Defaults to `Date.now()`.
 * @returns `true` when the engine may wait.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	options: ProviderOptionsInput,
	now: number = Date.now()
): boolean {
	if (
		snapshot.activeUI !== 'banner' ||
		snapshot.model === 'iab' ||
		snapshot.experiment ||
		snapshot.experimentPending ||
		snapshot.externalPermissions ||
		isIABConfigured(options.iab) ||
		options.consentSource ||
		options.experiment ||
		options.gpp ||
		(options.networkBlocker && options.networkBlocker.enabled !== false) ||
		options.enabled === false ||
		options.persistence === false
	) {
		return false;
	}
	// The app's categories (configured and discovered): a permissive scope
	// grants the ones outside the policy, which gate nothing here.
	const permissions = snapshot.effectivePermissions as Record<
		string,
		boolean | undefined
	>;
	const granted = (snapshot.consentCategories ?? Object.keys(permissions)).some(
		(category) => category !== 'necessary' && permissions[category]
	);
	if (granted) {
		return false;
	}
	const serverStart = options.scriptLoader?.serverStart !== false;
	if (
		options.scripts?.some(
			(script) =>
				isRunnableNow(script, snapshot) &&
				!(serverStart && script.serverStart && script.src)
		)
	) {
		return false;
	}
	return (['all', 'none'] as const).every(
		(choice) =>
			planInstantCommit({
				actionAt: now,
				choice,
				now,
				snapshot,
				subjectId: 'boot-check',
			}) !== null
	);
};

/**
 * The snapshot's copy with every key the English defaults have. Before
 * `ConsentRoot`'s engine loads, the browser's surfaces have no defaults to
 * fall back to (`../translation-defaults.ts`), so the server fills the
 * gaps of a partial bundle. An English bundle comes back unchanged. The
 * IAB copy is left out: the IAB surfaces carry their own defaults.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @returns The snapshot with a complete bundle.
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
 * @returns The boot's markup and whether the engine may wait.
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
