import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ɵLegalLinkSelection as LegalLinkSelection } from '@inth/angular';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import type { ConsentDialogTriggerOptions } from '@inth/angular/consent-dialog';

/**
 * The stock consent UI in one tag: the cookie banner and the preference
 * dialog.
 *
 * The dialog's body stays out of the first load: it loads when the dialog
 * opens, or earlier in idle time or on
 * hover or focus of the banner's Customize button. Use the two components
 * on their own to pass each its own inputs or templates.
 *
 * @example
 * ```html
 * <inth-consent-root [legalLinks]="['privacyPolicy']" />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'inth-consent-root',
	template: `<inth-consent-banner
			[noStyle]="noStyle()"
			[disableAnimation]="disableAnimation()"
			[hideBranding]="hideBranding()"
			[legalLinks]="legalLinks()"
		/>
		<inth-consent-dialog
			[noStyle]="noStyle()"
			[disableAnimation]="disableAnimation()"
			[hideBranding]="hideBranding()"
			[legalLinks]="legalLinks()"
			[showTrigger]="showTrigger()"
		/>`,
})
export class ConsentRoot {
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Skip enter and exit motion. Defaults to the provider's setting. */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Hide the "Secured by" attribution on both surfaces. */
	readonly hideBranding = input(false);
	/** Which of the provider's legal links both surfaces show. */
	readonly legalLinks = input<LegalLinkSelection | undefined>(undefined);
	/**
	 * Render a `<inth-consent-dialog-trigger>` with the dialog. Pass an
	 * object to set the trigger's inputs.
	 */
	readonly showTrigger = input<boolean | ConsentDialogTriggerOptions>(false);
}
