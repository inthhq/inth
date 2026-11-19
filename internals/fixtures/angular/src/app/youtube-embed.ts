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
		<inth-consent-gate category="measurement">
			<ng-template inthConsentGateContent>
				<iframe
					title="YouTube video"
					src="https://www.youtube-nocookie.com/embed/czTksCF6X8Y?playsinline=1"
					allow="encrypted-media; picture-in-picture"
					allowfullscreen
				></iframe>
			</ng-template>
			<ng-template inthConsentGatePlaceholder>
				<div class="placeholder">
					<p>Allow measurement to load this YouTube video.</p>
					<button
						type="button"
						inthConsentDialogLink
					>
						Choose video permissions
					</button>
				</div>
			</ng-template>
		</inth-consent-gate>
	`,
})
export class YouTubeEmbed {}
