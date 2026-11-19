// #region docs:dev-tools
import { ChangeDetectionStrategy, Component, isDevMode } from '@angular/core';
import { ConsentDevTools } from '@inth/angular/devtools';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDevTools],
	selector: 'app-consent-dev-tools',
	template: `
		<!-- @defer moves the panel's code into a chunk that loads only in dev. -->
		@if (dev) {
			@defer {
				<inth-consent-dev-tools position="bottom-left" />
			}
		}
	`,
})
export class DevToolsPanel {
	protected readonly dev = isDevMode();
}
// #endregion docs:dev-tools
