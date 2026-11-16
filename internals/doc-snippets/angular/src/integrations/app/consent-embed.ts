// #region docs:integration-embed title="src/app/consent-embed.ts"
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ConsentGate, ConsentGateContent } from '@c15t/angular/consent-gate';

import {
	embedAspectRatio,
	embedCategory,
	embedTitle,
	embedURL,
} from '../embed-config';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentGate, ConsentGateContent],
	selector: 'app-consent-embed',
	template: `
		<c15t-consent-gate [category]="category">
			<ng-template c15tConsentGateContent>
				<iframe
					[src]="url"
					[title]="title"
					loading="lazy"
					allowfullscreen
					[style.width]="'100%'"
					[style.aspect-ratio]="aspectRatio"
					[style.min-height]="'200px'"
					[style.border]="'0'"
				></iframe>
			</ng-template>
		</c15t-consent-gate>
	`,
})
export class ConsentEmbed {
	protected readonly category = embedCategory;
	protected readonly title = embedTitle;
	protected readonly aspectRatio = embedAspectRatio;
	// A constant URL from your own config, so it is safe to trust.
	protected readonly url =
		inject(DomSanitizer).bypassSecurityTrustResourceUrl(embedURL);
}
// #endregion docs:integration-embed
