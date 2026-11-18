// #region docs:consent-buttons
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentButton } from '@inth/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentButton],
	selector: 'app-cookie-choices',
	template: `
		<button
			c15t-consent-button
			action="reject"
		>
			Reject optional
		</button>
		<button
			c15t-consent-button
			action="customize"
		>
			Choose cookies
		</button>
		<button
			c15t-consent-button
			action="accept"
			variant="primary"
			mode="filled"
		>
			Accept all
		</button>
	`,
})
export class CookieChoices {}
// #endregion docs:consent-buttons
