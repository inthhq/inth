/* oxlint-disable react/no-danger -- Static fixture markup from consent-gate-page.ts, identical on every arm; no user input. */
import {
	gatePageCSS,
	gatePageHTML,
} from '@inth/benchmarking/consent-gate-page';

/** Consent gate page: CookieBench's article under `ConsentRoot`. */
const GatePage = () => (
	<>
		<style dangerouslySetInnerHTML={{ __html: gatePageCSS }} />
		<div dangerouslySetInnerHTML={{ __html: gatePageHTML }} />
	</>
);

export default GatePage;
