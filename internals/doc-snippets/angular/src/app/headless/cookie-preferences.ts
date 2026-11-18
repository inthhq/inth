// #region docs:own-preferences
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsentManager } from '@inth/angular';
import type { AllConsentNames } from '@inth/angular';
import { SwitchControl, Switch, SwitchThumb } from '@inth/angular/primitives';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [FormsModule, SwitchControl, Switch, SwitchThumb],
	selector: 'app-cookie-preferences',
	template: `
		@if (consent.draft.isStale()) {
			<p role="alert">The cookie policy changed. Review your choices.</p>
		}
		<fieldset>
			<legend>Cookie preferences</legend>
			@for (category of consent.consentTypes(); track category.name) {
				<div class="row">
					<span [id]="'label-' + category.name">{{
						title(category.name)
					}}</span>
					<button
						inthSwitch
						[attr.aria-labelledby]="'label-' + category.name"
						[disabled]="category.name === 'necessary'"
						[ngModel]="consent.draft.values()[category.name] ?? false"
						(ngModelChange)="consent.setConsent(category.name, $event)"
					>
						<span inthSwitchControl><span inthSwitchThumb></span></span>
					</button>
				</div>
			}
		</fieldset>
		<button
			type="button"
			[disabled]="consent.draft.isStale()"
			(click)="save()"
		>
			Save preferences
		</button>
	`,
})
export class CookiePreferences {
	protected readonly consent = inject(ConsentManager);

	readonly #copy = computed(() => {
		const config = this.consent.translationConfig();
		return config.translations[config.defaultLanguage ?? 'en'];
	});

	protected title(name: AllConsentNames): string {
		return this.#copy()?.consentTypes?.[name]?.title ?? name;
	}

	protected async save(): Promise<void> {
		// Records the draft. Throws if the policy changed since it started.
		await this.consent.saveConsents('custom');
	}
}
// #endregion docs:own-preferences
