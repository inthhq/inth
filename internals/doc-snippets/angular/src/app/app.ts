// #region docs:app-component
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, ConsentDialogLink, RouterOutlet],
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
		<inth-consent-banner />
		<inth-consent-dialog />
	`,
})
export class App {}
// #endregion docs:app-component
