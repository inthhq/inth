import type {
	ConsentExperiment,
	ConsentPresentation,
	ClearOnRevocationConfig,
	HydrationRecords,
	Vendor,
} from '@inth/sdk/engine';
import type {
	ConsentControlOptions,
	ConsentRuntimeOptions,
	RuntimeIABOptions,
} from '@inth/sdk/runtime';
import type { ConsentConfig as BaseConsentConfig } from '@inth/sdk/schema/config';
import type { InitOutput } from '@inth/sdk/schema/types';
import type { Theme, UIOptions } from '@inth/sdk/ui/theme';
import type { HTMLAttributes } from 'vue';

/** Nuxt options for the server render and the consent route. */
export interface ConsentServerConfig {
	/**
	 * Longest server rendering waits for the visitor's policy, in
	 * milliseconds. Past it the page renders without a resolved policy: no
	 * consent UI in the server HTML, optional categories denied, gated
	 * scripts and embeds blocked, and the browser resolves the policy after
	 * hydration. With `manifest()` the manifest request keeps running and
	 * fills the cache for the next request. Applies to the render only; the
	 * browser's own init requests wait for the manifest. `false` (or
	 * `Infinity`) removes the budget; any other value that is not a finite,
	 * non-negative number uses the default.
	 *
	 * @default 500
	 */
	timeoutMs?: number | false;
}

export interface ConsentConfig
	extends
		BaseConsentConfig<HTMLAttributes>,
		ConsentServerConfig,
		ConsentControlOptions {
	/**
	 * Vendors the preference center lists under their category, each with
	 * its own switch, so a visitor can grant a category and still turn one
	 * vendor off. Scripts, network rules and iframes naming a vendor's `id`
	 * follow that choice. Merged with vendors the backend declares.
	 */
	vendors?: Vendor[];
	/** Remove configured browser data when its consent permission is revoked. */
	clearOnRevocation?: ClearOnRevocationConfig;
	/**
	 * Load `@inth/integrations` scripts from the Inth script registry: each
	 * script the consent manifest lists loads from the registry's URL with an
	 * integrity hash the browser checks. Initial-only. Experimental: its name
	 * and behaviour can change in a minor release.
	 * @default false
	 */
	experimentalScriptRegistry?: boolean;
	/**
	 * Reload the page after an accept, reject or save turns off a category or
	 * vendor that was granted, or after a `consentSource` withdraws one.
	 * Removing a script cannot stop code that already ran, so the reload
	 * starts a document with only permitted code. Waits for the save request.
	 * Set `false` to handle revocation yourself.
	 * @default true
	 */
	reloadOnConsentRevoked?: boolean;
	/** Resolved server init data, reused for the first client render. */
	prefetch?: InitOutput;
	/** Raw server records with their request evaluation clock. */
	initialRecords?: HydrationRecords;
	/** Application-owned prompt and preference presentation. */
	presentation?: ConsentPresentation;
	/** Scripts whose loading follows the shared consent permissions. */
	scripts?: ConsentRuntimeOptions['scripts'];
	/**
	 * A/B experiment on prompt/preferences presentation. The assigned arm is
	 * merged over `presentation` (read it with `useResolvedPresentation()`),
	 * exposed through `useExperiment()`, and recorded with every impression
	 * and choice.
	 */
	experiment?: ConsentExperiment;
	/** Receives kernel events only when the corresponding change occurs. */
	callbacks?: ConsentRuntimeOptions['callbacks'];
	/**
	 * Turn on IAB TCF. Set it, even to `{}`, and Inth mounts its CMP
	 * (`__tcfapi`) and shows the IAB banner while the visitor's policy uses
	 * the `iab` model. Left unset, `false`, or `{ enabled: false }`, IAB
	 * stays off and the IAB code never loads; an `iab` policy whose vendor
	 * list arrives then throws an `IABUnavailableError`.
	 *
	 * The object takes publisher settings: `publisherRestrictions`,
	 * `publisherCountryCode`, `vendors`, `customVendors`, `cmpVersion`, and
	 * `cmpId` or `gvl` when the backend does not supply them. Fields left
	 * out come from `/v1/consent/init`. Read once, when the app starts.
	 *
	 * @example
	 * ```ts
	 * iab: {
	 * 	publisherCountryCode: 'DE',
	 * 	publisherRestrictions: [
	 * 		{ purposeId: 2, restrictionType: 1, vendorIds: [755] },
	 * 	],
	 * }
	 * ```
	 */
	iab?: RuntimeIABOptions;
	/**
	 * Light or dark for the banner and dialogs, through the `inth-dark`
	 * class on `<html>`.
	 *
	 * `'light'` and `'dark'` force a scheme. `'system'` follows
	 * `prefers-color-scheme` and keeps following it as the visitor changes
	 * it. Left unset, `inth-dark` mirrors a `dark` class on `<html>`, so a
	 * site theme switch that toggles `dark` also switches the consent UI.
	 * `null` leaves `inth-dark` to the site.
	 *
	 * Nuxt sets the class for `'dark'` and `'system'` from an inline script
	 * in the server HTML, so the first paint is already dark.
	 */
	colorScheme?: UIOptions['colorScheme'];
	/**
	 * Design tokens, including `dark` colors, written as CSS custom
	 * properties into the same `<style id="inth-css-vars">` element as
	 * `tokens`. Where both set a variable, `theme` wins. `theme.slots`
	 * style the same parts as `components`, which win where both set the
	 * same attribute.
	 *
	 * @example
	 * ```ts
	 * theme: {
	 * 	colors: { primary: '#2f6f4e' },
	 * 	dark: { primary: '#7fd1a8', surface: '#101512' },
	 * }
	 * ```
	 */
	theme?: Theme;
}
