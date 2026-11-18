// #region docs:language-switcher
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConsentManager } from '@inth/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'app-language-switcher',
	template: `
		<label>
			Language
			<select
				[value]="consent.translations()?.language ?? 'en'"
				(change)="setLanguage($event)"
			>
				<option value="en">English</option>
				<option value="de">Deutsch</option>
				<option value="fr">Français</option>
			</select>
		</label>
	`,
})
export class LanguageSwitcher {
	protected readonly consent = inject(ConsentManager);

	protected setLanguage(event: Event): void {
		// Resolves the policy again, so the backend returns copy in this language.
		this.consent.setLanguage((event.target as HTMLSelectElement).value);
	}
}
// #endregion docs:language-switcher
