// #region docs:banner-templates
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
	ConsentBannerAction,
	ConsentBannerDescription,
	ConsentBannerTitle,
	ConsentBanner,
	ConsentButton,
} from '@inth/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentBannerAction,
		ConsentBannerDescription,
		ConsentBannerTitle,
		ConsentBanner,
		ConsentButton,
	],
	selector: 'app-consent-banner',
	template: `
		<inth-consent-banner>
			<!-- The translated title, as let-title. The <h2> stays. -->
			<ng-template
				inthConsentBannerTitle
				let-title
			>
				<span aria-hidden="true">🍪</span> {{ title }}
			</ng-template>
			<ng-template
				inthConsentBannerDescription
				let-notice="notice"
			>
				@if (notice) {
					This site uses cookies that need no choice from you.
				} @else {
					We use cookies for analytics and ads.
					<a href="/cookies">Read the cookie policy</a>.
				}
			</ng-template>
			<!-- Once per action the policy shows, in the policy's order. -->
			<ng-template
				inthConsentBannerAction
				let-action
				let-label="label"
				let-variant="variant"
				let-mode="mode"
			>
				<button
					inth-consent-button
					[action]="action"
					[variant]="variant"
					[mode]="mode"
				>
					{{ label }}
				</button>
			</ng-template>
		</inth-consent-banner>
	`,
})
export class AppConsentBanner {}
// #endregion docs:banner-templates
