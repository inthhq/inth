import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
} from '@angular/core';
import {
	ConsentManager,
	HeadlessConsent,
	resolveActionLabels,
	resolvePromptCopy,
} from '@inth/angular';
import type { AllConsentNames } from '@inth/angular';

import { ExamplePage } from './example-page';

/**
 * The page with consent UI of its own, built on `HeadlessConsent` and
 * `ConsentManager`. The policy still decides which actions the banner
 * offers.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ExamplePage],
	selector: 'app-headless-page',
	template: `
		@if (headless.banner().isVisible) {
			<section
				class="consent-prompt"
				[attr.aria-label]="copy().title"
			>
				<p>{{ copy().description }}</p>
				@for (group of headless.banner().actionGroups; track $index) {
					@for (action of group; track action) {
						<button
							type="button"
							(click)="headless.performAction(action)"
						>
							{{ labels()[action] }}
						</button>
					}
				}
			</section>
		} @else if (headless.activeUI() === 'dialog') {
			<section
				class="consent-prompt"
				aria-label="Privacy settings"
			>
				@for (category of consent.consentTypes(); track category.name) {
					<label>
						<input
							type="checkbox"
							[checked]="consent.selectedConsents()[category.name] ?? false"
							[disabled]="category.name === 'necessary'"
							(change)="select(category.name, $event)"
						/>
						{{ title(category.name) }}
					</label>
				}
				<button
					type="button"
					(click)="save()"
				>
					Save
				</button>
			</section>
		}
		<app-example-page />
		<footer>
			<button
				type="button"
				(click)="headless.openDialog()"
			>
				Privacy settings
			</button>
		</footer>
	`,
})
export class HeadlessPage {
	protected readonly headless = inject(HeadlessConsent);
	protected readonly consent = inject(ConsentManager);

	// The active language, with English for any missing key.
	readonly #bundle = computed(() => this.consent.translations()?.translations);
	protected readonly copy = computed(() =>
		resolvePromptCopy(this.#bundle(), this.consent.policyRule().prompt)
	);
	protected readonly labels = computed(() =>
		resolveActionLabels(this.#bundle())
	);

	protected title(name: AllConsentNames): string {
		return this.#bundle()?.consentTypes?.[name]?.title ?? name;
	}

	protected select(name: AllConsentNames, event: Event): void {
		this.consent.setSelectedConsent(
			name,
			(event.target as HTMLInputElement).checked
		);
	}

	// Preferences stay open until saved. Inth records the draft locally
	// before the network request, so closing right away is safe.
	protected save(): void {
		void this.consent.saveConsents('custom');
		this.headless.closeUI();
	}
}
