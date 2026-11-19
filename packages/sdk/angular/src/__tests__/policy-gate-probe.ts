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
	selector: 'inth-policy-gate-probe',
	template: `
		<inth-consent-gate category="marketing">
			<ng-template inthConsentGatePlaceholder>
				<div data-testid="policy-iframe-placeholder">Blocked frame</div>
			</ng-template>
			<iframe
				title="probe"
				sandbox=""
				src="about:blank#inth-policy-probe"
				data-testid="policy-iframe"
			></iframe>
		</inth-consent-gate>
	`,
})
export class PolicyGateProbe {}
