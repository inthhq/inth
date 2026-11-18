import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, ConsentDialogLink],
	selector: 'app-root',
	template: `
		<main>
			<h1>inth on Angular 20</h1>
			<p>The oldest Angular version &#64;inth/angular supports.</p>
		</main>
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
// oxlint-disable-next-line typescript/no-extraneous-class -- An Angular component is a decorated class.
export class App {}
