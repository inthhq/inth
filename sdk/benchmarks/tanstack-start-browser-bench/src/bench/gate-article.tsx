/* oxlint-disable react/no-danger -- Static fixture markup from consent-gate-page.ts, identical on every arm; no user input. */
import {
	gatePageCSS,
	gatePageHTML,
} from '@c15t/benchmarking/consent-gate-page';

/**
 * The consent gate article, shared by the gate page and its control. It
 * imports no consent code, so the control route stays free of c15t.
 */
export const GateArticle = () => (
	<>
		<style dangerouslySetInnerHTML={{ __html: gatePageCSS }} />
		<div dangerouslySetInnerHTML={{ __html: gatePageHTML }} />
	</>
);
