import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

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
				inthConsentDialogLink
			>
				Privacy settings
			</button>
		</footer>
		<inth-consent-banner />
		<inth-consent-dialog />
	`,
})
export class HomePage {}
