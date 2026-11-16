import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner, ConsentDialogLink } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';

import { ExamplePage } from './example-page';

/** The page with the stock banner and preference dialog. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, ConsentDialogLink, ExamplePage],
	selector: 'app-home-page',
	template: `
		<app-example-page />
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
export class HomePage {}
