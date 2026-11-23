/**
 * Page parts the Privacy Choices stories share: a plain page under the
 * prompt with the persistent "Your Privacy Choices" link, and the offline
 * rules per region.
 *
 * Angular has no `PrivacyChoicesLink` component yet, so the page renders
 * its own: a button with the same test id and label as React's, shown
 * while the policy offers the opt-out right, that opens the dialog.
 */
/* eslint-disable max-classes-per-file -- The stories' small page components belong together. */
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
} from '@angular/core';
import { ConsentManager } from '@inth/angular';
import type { PolicyRule } from '@inth/sdk/engine';
import { resolveOptOutLink, resolveOptOutState } from '@inth/sdk/surface-state';

/** "Your Privacy Choices", as React's `PrivacyChoicesLink` renders it. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'storybook-privacy-choices-link',
	template: `@if (offered()) {
		<button
			type="button"
			data-testid="privacy-choices-link"
			[attr.data-inth-rights]="rights()"
			[attr.data-opt-out-variant]="link().variant"
			(click)="consent.setActiveUI('dialog')"
		>
			{{ link().label }}
		</button>
	}`,
})
export class StorybookPrivacyChoicesLink {
	protected readonly consent = inject(ConsentManager);
	protected readonly offered = computed(() => {
		const snapshot = this.consent.snapshot();
		return (
			snapshot.resolution.status === 'matched' &&
			resolveOptOutState(snapshot).available &&
			snapshot.policyRule.rights.includes('opt-out')
		);
	});
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);
	protected readonly link = computed(() =>
		resolveOptOutLink(
			this.consent.copy(),
			this.consent.presentation()?.optOutLink
		)
	);
}

/** The site's own link to the dialog, where the stock link does not render. */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
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

/** The page's markup around the prompt; `links` is the footer's content. */
export const demoPage = (links: string) => `
	<main style="font-family: system-ui, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 720px; min-height: 160vh; padding: 48px 24px">
		<h1>Acme Outdoor</h1>
		<p>
			Tents, packs and stoves for every season. Browse the catalogue, read the
			field guides, or find a store near you.
		</p>
		<p><a href="#catalogue">Catalogue</a> · <a href="#guides">Field guides</a></p>
		<footer style="display: flex; gap: 24px; margin-top: 48px">${links}</footer>
	</main>
`;

/** The GPC rule the US stories use. */
export const US_GPC: PolicyRule['privacySignals'] = {
	gpc: { denyCategories: ['marketing', 'measurement'] },
};
