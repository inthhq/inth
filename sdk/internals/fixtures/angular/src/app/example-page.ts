import { PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConsentManager } from '@c15t/angular';
import { ConsentDevTools } from '@c15t/angular/devtools';

import { experimentFromSearch } from './experiment';
import { ExperimentReadout } from './experiment-readout';
import { YouTubeEmbed } from './youtube-embed';

/**
 * Demo page content shared by every variant: design links, live status,
 * the gated video and DevTools. The consent setup is in `app.config.ts`
 * and the route components.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDevTools, ExperimentReadout, YouTubeEmbed],
	selector: 'app-example-page',
	template: `
		<main>
			<p>c15t / Angular</p>
			<h1>Consent example</h1>
			<p>One consent setup for your analytics, advertising and video embeds.</p>
			<nav aria-label="Banner design">
				<a href="/">Default</a>
				<a href="/?design=branded">Branded</a>
				<a href="/headless">Headless</a>
				<a href="/?experiment=1">Experiment</a>
				<a href="/?experiment=1&arm=wall">Experiment (wall arm)</a>
			</nav>
			@if (experiment) {
				<app-experiment-readout />
			}
			<section class="card">
				<h2>Scripts follow your choices</h2>
				<ul class="statuses">
					<li>
						PostHog:
						{{
							consent.effectivePermissions().measurement
								? 'measurement allowed'
								: 'waiting for measurement'
						}}
					</li>
					<li>
						X Pixel:
						{{
							consent.effectivePermissions().marketing
								? 'marketing allowed'
								: 'waiting for marketing'
						}}
					</li>
				</ul>
				<p>
					Replace the placeholder project IDs in src/scripts.ts with your own.
					DevTools shows the scripts' loading status.
				</p>
			</section>
			<section class="card">
				<h2>YouTube embed</h2>
				<app-youtube-embed />
			</section>
		</main>
		<c15t-consent-dev-tools position="bottom-right" />
	`,
})
export class ExamplePage {
	protected readonly consent = inject(ConsentManager);
	protected readonly experiment =
		experimentFromSearch(inject(PlatformLocation).search) !== undefined;
}
