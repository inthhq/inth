// #region docs:bottom-bar
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'app-consent',
	template: `
		<inth-consent-banner
			[container]="{ type: 'banner', edge: 'bottom' }"
			edgeStyle="flush"
			heading="Your privacy"
			rejectButtonText="Reject optional"
			[layout]="[['reject', 'accept'], 'customize']"
		/>
		<inth-consent-dialog />
	`,
})
export class Consent {}
// #endregion docs:bottom-bar
