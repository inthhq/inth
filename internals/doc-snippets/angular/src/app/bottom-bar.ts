// #region docs:bottom-bar
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'app-consent',
	template: `
		<c15t-consent-banner
			variant="bar"
			position="bottom"
			heading="Your privacy"
			rejectButtonText="Reject optional"
			[layout]="[['reject', 'accept'], 'customize']"
			primaryButton="accept"
		/>
		<c15t-consent-dialog />
	`,
})
export class Consent {}
// #endregion docs:bottom-bar
