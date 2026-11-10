/**
 * The prop shapes `ConsentProvider` accepts. Compiled by `check-types`, never run.
 */

import { ConsentProvider } from '../consent-provider';

declare const enabled: boolean;

export const presents = (
	<ConsentProvider privacyPolicyURL="https://example.com/privacy">
		<span />
	</ConsentProvider>
);

export const optsOut = (
	<ConsentProvider autoPresent={false}>
		<span />
	</ConsentProvider>
);

export const decidedAtRuntime = (
	<ConsentProvider
		autoPresent={enabled}
		privacyPolicyURL="https://example.com/privacy"
	>
		<span />
	</ConsentProvider>
);

export const missingURL = (
	// @ts-expect-error -- presenting needs the privacy-policy URL.
	<ConsentProvider>
		<span />
	</ConsentProvider>
);

export const presentsWithoutURL = (
	// @ts-expect-error -- `autoPresent` on still needs the URL.
	<ConsentProvider autoPresent>
		<span />
	</ConsentProvider>
);
