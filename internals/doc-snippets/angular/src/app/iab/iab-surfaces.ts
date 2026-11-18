// #region docs:iab-surfaces
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { IABConsentBanner, IABConsentDialog } from '@inth/angular/iab';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog, IABConsentBanner, IABConsentDialog],
	selector: 'app-consent-surfaces',
	template: `
		<!-- Visitors whose policy is not IAB get the standard banner and dialog. -->
		<inth-consent-banner />
		<inth-consent-dialog />
		<!-- Visitors under an IAB policy get the TCF banner and preference center. -->
		<inth-iab-consent-banner />
		<inth-iab-consent-dialog />
	`,
})
export class ConsentSurfaces {}
// #endregion docs:iab-surfaces
