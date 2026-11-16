/**
 * Server side of the deferred engine: whether the browser may render this
 * visitor from the server's snapshot and load the consent engine after the
 * page, and the boot that carries the snapshot. Only the server render
 * loads this module.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@c15t/core';
import { defaultTranslationConfig } from '@c15t/core/runtime/provider';
import type { ConsentProviderRuntime } from '@c15t/core/runtime/provider';
import { planInstantCommit } from '@c15t/core/surface-actions/instant-commit';
import {
	isPlainScript,
	isRunnableNow,
} from '@c15t/core/surface-actions/plain-scripts';
import { deepMergeTranslations } from '@c15t/translations';
import type { Translations } from '@c15t/translations';

import { isIABConfigured } from '../iab-loader';
import type { C15tResolvedOptions } from '../options';
import type { ConsentBoot } from './boot';

/** Options that need the engine as the page loads. */
const needsEngineNow = function needsEngineNow(
	snapshot: ConsentSnapshot,
	options: C15tResolvedOptions
): boolean {
	return Boolean(
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
	);
};

/**
 * A decision that changes on its own this soon is left to the engine,
 * which re-evaluates it on time.
 */
const DEADLINE_MARGIN_MS = 60_000;

/**
 * Whether a visitor with nothing to answer, such as one who chose on an
 * earlier visit, can wait for the engine: every script that may run now
 * is one the server starts or a plain `src` the first-load chunk inserts
 * the way the loader would (`startPlainScripts`), and no decision expires
 * soon.
 */
const canDeferAnswered = function canDeferAnswered(
	snapshot: ConsentSnapshot,
	options: C15tResolvedOptions,
	now: number
): boolean {
	if (
		snapshot.resolution.status !== 'matched' ||
		snapshot.policyPending ||
		(snapshot.nextDeadline !== null &&
			snapshot.nextDeadline - now < DEADLINE_MARGIN_MS)
	) {
		return false;
	}
	const serverStart = options.scriptLoader?.serverStart !== false;
	return !options.scripts?.some(
		(script) =>
			isRunnableNow(script, snapshot) &&
			!isPlainScript(script) &&
			!(serverStart && script.serverStart && script.src)
	);
};

/**
 * Whether the browser may start this visitor from the server's snapshot
 * and load the engine after the page. No option may need the engine at
 * once (IAB, an experiment, a consent source, GPP, the network blocker,
 * `enabled: false` or `persistence: false`). Then either the stock banner
 * asks for a choice, an accept and a reject are both something the
 * first-load chunk can record on its own (`planInstantCommit`), nothing
 * optional is granted yet and no script may run now that the server did
 * not start (the rule of `@c15t/svelte`'s `ConsentRoot` and `@c15t/vue`'s
 * Nuxt module); or nothing is shown and every script that may run is one
 * the first-load chunk or the server starts (`canDeferAnswered`).
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param options - The provider's options.
 * @param now - The clock. Defaults to `Date.now()`.
 * @returns `true` when the engine may wait.
 * @internal
 */
export const canDeferEngine = function canDeferEngine(
	snapshot: ConsentSnapshot,
	options: C15tResolvedOptions,
	now: number = Date.now()
): boolean {
	if (needsEngineNow(snapshot, options)) {
		return false;
	}
	if (snapshot.activeUI === 'none') {
		return canDeferAnswered(snapshot, options, now);
	}
	if (snapshot.activeUI !== 'banner') {
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
 * The snapshot's copy with every key the English defaults have. Before the
 * engine loads, the browser's surfaces have no defaults to fall back to
 * (`../translation-defaults.ts`), so the server fills the gaps of a
 * partial bundle. An English bundle comes back unchanged. The IAB copy is
 * left out unless the app configured IAB.
 *
 * @param snapshot - The snapshot the server rendered with.
 * @param withIAB - Whether to keep the IAB copy.
 * @returns The snapshot with a complete bundle.
 * @internal
 */
export const withCompleteTranslations = function withCompleteTranslations(
	snapshot: ConsentSnapshot,
	withIAB = false
): ConsentSnapshot {
	const { iab, ...rest } = defaultTranslationConfig.translations
		.en as Translations;
	const english = withIAB ? { ...rest, iab } : rest;
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

/**
 * The boot for a server render.
 *
 * @param runtime - The server's runtime, not started.
 * @param options - The provider's options, with its `prefetch`.
 * @returns The boot to leave in `TransferState`.
 * @internal
 */
export const planServerBoot = function planServerBoot(
	runtime: ConsentProviderRuntime,
	options: C15tResolvedOptions
): ConsentBoot {
	const snapshot = runtime.kernel.getServerSnapshot();
	const boot: ConsentBoot = {
		s: withCompleteTranslations(snapshot, isIABConfigured(options.iab)),
	};
	if (canDeferEngine(snapshot, options)) {
		boot.d = 1;
	}
	if (runtime.experiment) {
		boot.x = runtime.experiment;
	}
	// The vendor list can be large, and the server state already holds it.
	const gvl = options.prefetch?.initialIab?.gvl;
	if (gvl && snapshot.iab?.gvl === gvl) {
		boot.s = { ...boot.s, iab: { ...snapshot.iab, gvl: null } };
		boot.g = 1;
	}
	return boot;
};
