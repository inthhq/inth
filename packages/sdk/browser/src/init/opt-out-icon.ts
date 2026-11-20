/**
 * Stand-in for `../ui/opt-out-icon.ts` inside `inth.js`.
 *
 * The init script leaves any banner configured with a "Privacy Choices"
 * opt-out link to `inth.hosted.js` (`supportsEarlyBanner` in `./run.ts`),
 * so `inth.js` never bundles the CPPA opt-out SVG for sites using the
 * standard link. `rslib.config.ts` swaps this module in for `inth.js`.
 *
 * @packageDocumentation
 * @internal
 */

export const createOptOutIcon = function createOptOutIcon(): SVGSVGElement {
	throw new Error(
		'@inth/sdk: Privacy Choices opt-out icon requires inth.hosted.js.'
	);
};
