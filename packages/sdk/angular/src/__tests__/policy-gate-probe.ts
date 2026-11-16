import { ChangeDetectionStrategy, Component } from '@angular/core';

import {
	ConsentGate,
	ConsentGatePlaceholder,
} from '../../consent-gate/src/consent-gate';

/**
 * The policy suites' gate probe: a marketing gate around a blank iframe,
 * like the Svelte policy fixture's `ConsentGate`.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentGate, ConsentGatePlaceholder],
	selector: 'c15t-policy-gate-probe',
	template: `
		<c15t-consent-gate category="marketing">
			<ng-template c15tConsentGatePlaceholder>
				<div data-testid="policy-iframe-placeholder">Blocked frame</div>
			</ng-template>
			<iframe
				title="probe"
				sandbox=""
				src="about:blank#c15t-policy-probe"
				data-testid="policy-iframe"
			></iframe>
		</c15t-consent-gate>
	`,
})
export class PolicyGateProbe {}
