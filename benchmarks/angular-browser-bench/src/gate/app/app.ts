import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';

import { GateBridge } from './gate-bridge';

/** The quickstart's root component, plus the gate bridge. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		GateBridge,
		RouterOutlet,
	],
	selector: 'app-root',
	template: `
		<router-outlet />
		<gate-bridge />
		<footer>
			<!-- The gate reopens the choice here to replay a change of mind. -->
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
