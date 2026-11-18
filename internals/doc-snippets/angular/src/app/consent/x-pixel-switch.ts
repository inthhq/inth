// #region docs:vendor-switch
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConsentManager } from '@inth/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'app-x-pixel-switch',
	template: `
		<label>
			<input
				type="checkbox"
				[checked]="consent.selectedVendors()['x-pixel'] ?? true"
				(change)="toggle($event)"
			/>
			X Pixel
		</label>
		<button
			type="button"
			(click)="consent.saveConsents('custom')"
		>
			Save
		</button>
		<p>X Pixel may run: {{ consent.isVendorAllowed('x-pixel') }}</p>
	`,
})
export class XPixelSwitch {
	protected readonly consent = inject(ConsentManager);

	protected toggle(event: Event): void {
		const { checked } = event.target as HTMLInputElement;
		this.consent.setSelectedVendor('x-pixel', checked);
	}
}
// #endregion docs:vendor-switch
