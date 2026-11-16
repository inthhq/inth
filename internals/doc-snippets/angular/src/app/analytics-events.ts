// #region docs:analytics-events
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { injectEventDispatcher } from '@c15t/angular/consent-gate';
import { filter } from 'rxjs';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet],
	selector: 'app-root',
	template: `<router-outlet />`,
})
export class App {
	// Sends to the provider's scripts, and only while their category is
	// allowed. `pageviews` names the integrations that get page views.
	readonly #events = injectEventDispatcher({ pageviews: ['posthog'] });

	constructor() {
		inject(Router)
			.events.pipe(
				filter((event) => event instanceof NavigationEnd),
				takeUntilDestroyed()
			)
			.subscribe((event) => {
				this.#events.pageview(event.urlAfterRedirects);
			});
	}

	protected signUp(): void {
		this.#events.track('sign_up', { method: 'email' });
	}
}
// #endregion docs:analytics-events
