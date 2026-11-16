/**
 * `@c15t/react/static-banner`: the stock banner as HTML, for a build that
 * puts it in a client-rendered page's `index.html`.
 *
 * `consentManifest()` from `@c15t/core/build` (`c15t/build`) loads this
 * module in Node during `vite build`. It renders `<ConsentBanner />` the way
 * the client-rendered `ConsentProvider` renders it once the page's `/init`
 * answers: the same stand-in kernel, the same snapshot from the same answer.
 * The page shows that markup before its JavaScript has run, and the app's
 * banner replaces it when it renders.
 *
 * @packageDocumentation
 * @internal
 */

import { snapshotFromPrefetchedInit } from '@c15t/core/runtime/deferred-snapshot';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConsentBanner } from './components/prompt';
import { BANNER_SHEETS } from './components/shared/first-paint-sheets';
import { DeferredConsentShell } from './deferred/shell';

/**
 * The banner's stylesheets, in cascade order. The page holds them in
 * `<style data-href>` elements, which the app's banner adopts.
 *
 * @internal
 */
export const STATIC_BANNER_SHEETS: readonly { id: string; css: string }[] =
	BANNER_SHEETS.map(({ css, id }) => ({ css, id }));

const never = (): Promise<never> =>
	new Promise(() => {
		// The engine never loads at build time.
	});

/**
 * The stock banner's HTML for a visitor with no stored choice who gets
 * `init` from `/init`, including the inline script that records a tap made
 * before the app has loaded. Stylesheets are left out: see
 * {@link STATIC_BANNER_SHEETS}.
 *
 * @param init - An `/init` answer, such as one resolved from the manifest.
 * @returns The markup, or `undefined` when that answer shows no choice
 * banner: no prompt, a notice, IAB, vendors, or an answer the
 * client-rendered provider would not read itself.
 * @internal
 */
export const renderStaticBanner = function renderStaticBanner(
	init: NonNullable<Parameters<typeof snapshotFromPrefetchedInit>[0]>['init']
): string | undefined {
	const snapshot = snapshotFromPrefetchedInit({ init }, {});
	if (
		!snapshot ||
		snapshot.activeUI !== 'banner' ||
		snapshot.model === 'iab' ||
		snapshot.policyRule.prompt !== 'choice'
	) {
		return undefined;
	}
	const html = renderToStaticMarkup(
		<DeferredConsentShell<never>
			boot={{ s: snapshot }}
			defer
			loadEngine={never}
			// The page holds the sheets in `<head>`.
			options={{ styles: false }}
			prefetch={undefined}
			renderEngine={() => null}
			slotAfterMount
		>
			<ConsentBanner />
		</DeferredConsentShell>
	);
	return html.includes('data-testid="consent-banner-root"') ? html : undefined;
};
