/**
 * Page parts the banner and dialog stories share: a plain page under the
 * prompt with the persistent "Your Privacy Choices" link
 * (`<inth-privacy-choices-link>`), and the offline rules per region.
 */
/* eslint-disable max-classes-per-file -- The stories' small page components belong together. */
import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	input,
} from '@angular/core';
import { ConsentManager } from '@inth/angular';
import type { PolicyRule } from '@inth/sdk/engine';

/** The site's own link to the dialog, where the stock link does not render. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The button, not this element, is the footer's flex item, as in React.
	host: { style: 'display: contents' },
	selector: 'storybook-settings-link',
	template: `<button
		type="button"
		data-testid="consent-dialog-trigger"
		style="background: none; border: 0; color: inherit; cursor: pointer; font: inherit; padding: 0; text-decoration: underline"
		(click)="consent.setActiveUI('dialog')"
	>
		{{ label() }}
	</button>`,
})
export class StorybookSettingsLink {
	protected readonly consent = inject(ConsentManager);
	readonly label = input.required<string>();
}

/** Opens the dialog once the page renders, as the page link would. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'storybook-open-dialog',
	template: '',
})
export class StorybookOpenDialog {
	readonly #consent = inject(ConsentManager);
	constructor() {
		let opened = false;
		effect(() => {
			if (!opened && this.#consent.hasConsentUi()) {
				opened = true;
				this.#consent.setActiveUI('dialog');
			}
		});
	}
}

/**
 * The page's markup around the prompt; `links` is the footer's content.
 * The banner's page and the dialog's differ the way React's stories do, so
 * the page links lay out the same: the dialog page's footer is a row of
 * links and has no catalogue line.
 */
export const demoPage = (
	links: string,
	page: 'banner' | 'dialog' = 'banner'
) => `
	<main style="font-family: system-ui, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 720px; min-height: 160vh; padding: 48px 24px">
		<h1>Acme Outdoor</h1>
		<p>
			Tents, packs and stoves for every season. Browse the catalogue, read the
			field guides, or find a store near you.
		</p>
		${
			page === 'banner'
				? `<p><a href="#catalogue">Catalogue</a> · <a href="#guides">Field guides</a></p>
		<footer style="margin-top: 48px">${links}</footer>`
				: `<footer style="display: flex; gap: 24px; margin-top: 48px">${links}</footer>`
		}
	</main>
`;

/** The GPC rule the US stories use. */
export const US_GPC: PolicyRule['privacySignals'] = {
	gpc: { denyCategories: ['marketing', 'measurement'] },
};
