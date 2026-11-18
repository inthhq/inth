/**
 * The components the conformance driver mounts.
 *
 * A kind with no entry makes `mount()` throw
 * `DriverNotImplementedError`, so its suites fail until it is registered.
 *
 * An entry is the list of components the fixture renders inside the
 * provider, in order, with the inputs each one gets. `consent-banner`
 * renders the banner and the dialog, as the Svelte fixture does.
 */
import type { Type } from '@angular/core';
import type { MountableComponent } from '@c15t/conformance';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import { ConsentWidget } from '@inth/angular/consent-widget';
import { IABConsentBanner, IABConsentDialog } from '@inth/angular/iab';

import { ConsentBanner } from '../lib/banner/consent-banner';
import { PolicyGateProbe } from './policy-gate-probe';

/** One component the fixture renders, with its inputs. */
export interface ConformanceEntry {
	readonly component: Type<unknown>;
	readonly inputs?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Component registry: `MountableComponent` kind -> what the fixture renders.
// ---------------------------------------------------------------------------
export const CONFORMANCE_COMPONENTS: Partial<
	Record<MountableComponent, readonly ConformanceEntry[]>
> = {
	'consent-banner': [
		{ component: ConsentBanner },
		{ component: ConsentDialog },
	],
	'consent-dialog': [{ component: ConsentDialog }],
	'consent-widget': [{ component: ConsentWidget }],
	'iab-consent-banner': [{ component: IABConsentBanner }],
	'iab-consent-dialog': [
		{ component: IABConsentDialog, inputs: { open: true } },
	],
};

// ---------------------------------------------------------------------------
// Policy-scenario fixture: the surfaces every policy session renders, in
// this order, like `packages/sdk/svelte/src/__tests__/fixtures/policy-fixture.svelte`.
// The `[c15tConsentDialogLink]` button is always rendered after them.
// ---------------------------------------------------------------------------
export const POLICY_SURFACES: {
	/** The banner, with `hideBranding` (attribution changes after mount). */
	banner?: ConformanceEntry;
	/** The consent dialog. */
	dialog?: ConformanceEntry;
	/** `<c15t-consent-dialog-trigger>`. */
	trigger?: ConformanceEntry;
	/**
	 * Rendered only for scenarios that probe gates: a component that wraps
	 * `<iframe data-testid="policy-iframe" title="probe" sandbox=""
	 * src="about:blank#c15t-policy-probe">` in a marketing `ConsentGate`
	 * whose placeholder is `<div data-testid="policy-iframe-placeholder">`.
	 */
	gateProbe?: ConformanceEntry;
} = {
	banner: { component: ConsentBanner, inputs: { hideBranding: true } },
	// As React's driver: the scenarios drive IAB policies through the
	// standard dialog, which opens for them only when asked to.
	dialog: {
		component: ConsentDialog,
		inputs: { models: ['opt-in', 'opt-out', 'iab', 'none'] },
	},
	gateProbe: { component: PolicyGateProbe },
	trigger: { component: ConsentDialogTrigger },
};
