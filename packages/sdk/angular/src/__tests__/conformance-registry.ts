/**
 * The components the conformance driver mounts.
 *
 * A kind with no entry makes `mount()` throw
 * `DriverNotImplementedError`, so its suites fail until it is registered.
 *
 * An entry builds the list of components the fixture renders inside the
 * provider, in order, with the inputs each one gets. `consent-banner`
 * renders the banner and the dialog, as the Svelte fixture does. The
 * shared suites ask for a blocking banner through the provider's
 * `trapFocus`; the banner takes it as `blockUntilChoice`, as React's
 * driver does.
 */
import type { Type } from '@angular/core';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import { ConsentWidget } from '@inth/angular/consent-widget';
import { IABConsentBanner, IABConsentDialog } from '@inth/angular/iab';
import type { MountableComponent } from '@inth/conformance';

import { ConsentBanner } from '../lib/prompt/prompt';
import { PolicyGateProbe } from './policy-gate-probe';

/** One component the fixture renders, with its inputs. */
export interface ConformanceEntry {
	readonly component: Type<unknown>;
	readonly inputs?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Component registry: `MountableComponent` kind -> what the fixture renders.
// ---------------------------------------------------------------------------
/** What a mount asks of the registered components. */
export interface ConformanceRequest {
	/** The page blocks until the visitor chooses. */
	readonly blocking: boolean;
}

export const CONFORMANCE_COMPONENTS: Partial<
	Record<
		MountableComponent,
		(request: ConformanceRequest) => readonly ConformanceEntry[]
	>
> = {
	// As React's driver, without the attribution: it sits beside the card,
	// inside the blocking banner's focus trap, and the shared suites count
	// the card's controls.
	'consent-banner': ({ blocking }) => [
		{
			component: ConsentBanner,
			inputs: { blockUntilChoice: blocking, hideBranding: true },
		},
		{ component: ConsentDialog },
	],
	'consent-dialog': () => [{ component: ConsentDialog }],
	'consent-widget': () => [{ component: ConsentWidget }],
	'iab-consent-banner': () => [{ component: IABConsentBanner }],
	'iab-consent-dialog': () => [
		{ component: IABConsentDialog, inputs: { open: true } },
	],
};

// ---------------------------------------------------------------------------
// Policy-scenario fixture: the surfaces every policy session renders, in
// this order, like `packages/sdk/svelte/src/__tests__/fixtures/policy-fixture.svelte`.
// The `[inthConsentDialogLink]` button is always rendered after them.
// ---------------------------------------------------------------------------
export const POLICY_SURFACES: {
	/** The banner, with `hideBranding` (attribution changes after mount). */
	banner?: ConformanceEntry;
	dialog?: ConformanceEntry;
	/** `<inth-consent-dialog-trigger>`. */
	trigger?: ConformanceEntry;
	/**
	 * Rendered only for scenarios that probe gates: a component that wraps
	 * `<iframe data-testid="policy-iframe" title="probe" sandbox=""
	 * src="about:blank#inth-policy-probe">` in a marketing `ConsentGate`
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
