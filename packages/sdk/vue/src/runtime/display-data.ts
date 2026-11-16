/**
 * Snapshot-to-ref mappings shared by the consent runtime (`kernel.ts`) and
 * the Nuxt plugin's deferred context (`deferred/shell.ts`). Kept apart from
 * `kernel.ts`, which imports the whole runtime, so the first-load chunk can
 * use them.
 *
 * @packageDocumentation
 * @internal
 */
import type { ConsentSnapshot, KernelActiveUI } from '@c15t/core';
import type { ConsentActiveUI } from '@c15t/schema/config';
import type { InitOutput } from '@c15t/schema/types';

/** Translation, location and branding data for Vue components. Policy lives in the kernel snapshot. */
export type VueConsentDisplayData = Pick<
	InitOutput,
	| 'branding'
	| 'cmpId'
	| 'customVendors'
	| 'gvl'
	| 'gvlReference'
	| 'location'
	| 'translations'
>;

/**
 * `'manager'` and `null` are the Vue config's names for the kernel's
 * `'dialog'` and `'none'`, kept so `useConsentActiveUI()` reads as before.
 *
 * @internal
 */
export const toKernelActiveUI = function toKernelActiveUI(
	ui: ConsentActiveUI
): KernelActiveUI {
	if (ui === 'manager') {
		return 'dialog';
	}
	if (ui === null) {
		return 'none';
	}
	return ui;
};

/** @internal */
export const toVueActiveUI = function toVueActiveUI(
	ui: KernelActiveUI
): ConsentActiveUI {
	if (ui === 'dialog') {
		return 'manager';
	}
	if (ui === 'none') {
		return null;
	}
	return ui;
};

const DISPLAY_DATA_KEYS = [
	'branding',
	'cmpId',
	'customVendors',
	'gvl',
	'gvlReference',
	'location',
	'translations',
] as const;

/**
 * Keep the previous display data when every field is the same reference, so
 * components reading `useConsentInit()` don't re-render on kernel changes
 * that leave it alone (opening the dialog, a save, a privacy signal).
 *
 * @internal
 */
export const reuseDisplayData = function reuseDisplayData(
	next: VueConsentDisplayData | undefined,
	previous: VueConsentDisplayData | undefined
): VueConsentDisplayData | undefined {
	if (
		next &&
		previous &&
		DISPLAY_DATA_KEYS.every((key) => next[key] === previous[key])
	) {
		return previous;
	}
	return next;
};

/** @internal */
export const snapshotToDisplayData = function snapshotToDisplayData(
	snapshot: ConsentSnapshot
): VueConsentDisplayData | undefined {
	if (!snapshot.location || !snapshot.translations) {
		return undefined;
	}
	return {
		branding: snapshot.branding ?? 'c15t',
		cmpId: snapshot.iab?.cmpId ?? undefined,
		customVendors: snapshot.iab?.customVendors,
		gvl: snapshot.iab?.gvl ?? undefined,
		gvlReference: snapshot.iab?.gvlReference,
		location: snapshot.location,
		translations: snapshot.translations,
	};
};
