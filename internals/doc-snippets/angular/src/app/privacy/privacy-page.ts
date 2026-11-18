// #region docs:privacy-page
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConsentWidget } from '@inth/angular/consent-widget';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'app-privacy-page',
	template: `
		<h1>Privacy settings</h1>
		<p>Choose which cookies this site may use.</p>
		<c15t-consent-widget />
	`,
})
export class PrivacyPage {}
// #endregion docs:privacy-page
