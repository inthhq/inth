// #region docs:app-component
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsentBanner, ConsentDialogLink } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, ConsentDialogLink, RouterOutlet],
	selector: 'app-root',
	template: `
		<router-outlet />
		<footer>
			<button
				type="button"
				c15tConsentDialogLink
			>
				Privacy settings
			</button>
		</footer>
		<c15t-consent-banner />
		<c15t-consent-dialog />
	`,
})
export class App {}
// #endregion docs:app-component
