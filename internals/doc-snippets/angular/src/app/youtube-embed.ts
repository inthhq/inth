// #region docs:youtube-embed
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentDialogLink } from '@inth/angular';
import {
	ConsentGate,
	ConsentGateContent,
	ConsentGatePlaceholder,
} from '@inth/angular/consent-gate';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentDialogLink,
		ConsentGate,
		ConsentGateContent,
		ConsentGatePlaceholder,
	],
	selector: 'app-youtube-embed',
	template: `
		<!-- The iframe is created only while measurement is allowed. -->
		<c15t-consent-gate category="measurement">
			<ng-template c15tConsentGateContent>
				<iframe
					title="YouTube video"
					src="https://www.youtube-nocookie.com/embed/czTksCF6X8Y?playsinline=1"
					allow="encrypted-media; picture-in-picture"
					allowfullscreen
				></iframe>
			</ng-template>
			<ng-template c15tConsentGatePlaceholder>
				<div class="placeholder">
					<p>Allow measurement to load this YouTube video.</p>
					<button
						type="button"
						c15tConsentDialogLink
					>
						Choose video permissions
					</button>
				</div>
			</ng-template>
		</c15t-consent-gate>
	`,
})
export class YouTubeEmbed {}
// #endregion docs:youtube-embed
