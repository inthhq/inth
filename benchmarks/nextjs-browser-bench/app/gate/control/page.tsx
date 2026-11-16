/* oxlint-disable react/no-danger -- Static fixture markup from consent-gate-page.ts, identical on every arm; no user input. */
import {
	gatePageCSS,
	gatePageHTML,
} from '@c15t/benchmarking/consent-gate-page';

/** The gate page's article without any consent library: the LCP control. */
const GateControlPage = () => (
	<>
		<style dangerouslySetInnerHTML={{ __html: gatePageCSS }} />
		<div dangerouslySetInnerHTML={{ __html: gatePageHTML }} />
	</>
);

export default GateControlPage;
