// #region docs:if-consent
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IfConsent } from '@c15t/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IfConsent],
	selector: 'app-store-map',
	template: `
		<!-- A category name, or a condition such as { and: [...] }. -->
		<iframe
			*c15tIfConsent="'functionality'; else blocked"
			title="Store locations"
			src="https://www.google.com/maps/embed?pb=..."
		></iframe>
		<ng-template #blocked>
			<p>Allow functional cookies to show the map.</p>
		</ng-template>
	`,
})
export class StoreMap {}
// #endregion docs:if-consent
