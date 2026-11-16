import {
	ChangeDetectionStrategy,
	Component,
	DOCUMENT,
	inject,
} from '@angular/core';
import {
	gatePageCSS,
	gatePageHTML,
} from '@c15t/benchmarking/consent-gate-page';

const STYLE_ID = 'gate-page-css';

/**
 * CookieBench's article and stylesheet from `consent-gate-page.ts`, shared by
 * the gate app and the control app so both render the same markup.
 *
 * The article is the component's template, which the Angular compiler reads
 * from the shared constant at build time. Bound as `[innerHTML]` instead, it
 * would be set again during hydration, replacing the hero `<img>` (the LCP
 * element) after the server's copy had started loading.
 *
 * The stylesheet goes in `<head>` during the server render; the browser
 * finds it there and adds nothing.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'gate-article',
	styles: ':host { display: contents; }',
	template: gatePageHTML,
})
export class GateArticle {
	constructor() {
		const document = inject(DOCUMENT);
		if (!document.getElementById(STYLE_ID)) {
			const style = document.createElement('style');
			style.id = STYLE_ID;
			style.textContent = gatePageCSS;
			document.head.appendChild(style);
		}
	}
}
