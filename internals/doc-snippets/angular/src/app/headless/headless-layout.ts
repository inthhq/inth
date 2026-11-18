// #region docs:headless-layout
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

import { CustomConsentBanner } from './custom-consent-banner';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentDialog,
		ConsentDialogLink,
		CustomConsentBanner,
		RouterOutlet,
	],
	selector: 'app-root',
	template: `
		<router-outlet />
		<footer>
			<button
				type="button"
				inthConsentDialogLink
			>
				Privacy settings
			</button>
		</footer>
		<!-- Your banner; the stock dialog handles Customize. -->
		<app-custom-consent-banner />
		<inth-consent-dialog />
	`,
})
export class App {}
// #endregion docs:headless-layout
