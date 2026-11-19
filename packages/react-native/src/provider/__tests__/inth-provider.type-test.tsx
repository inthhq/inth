/**
 * The prop shapes `InthProvider` accepts. Compiled by `check-types`, never run.
 */

import { InthProvider } from '../inth-provider';

declare const enabled: boolean;

export const presents = (
	<InthProvider privacyPolicyUrl="https://example.com/privacy">
		<span />
	</InthProvider>
);

export const optsOut = (
	<InthProvider autoPresent={false}>
		<span />
	</InthProvider>
);

export const decidedAtRuntime = (
	<InthProvider
		autoPresent={enabled}
		privacyPolicyUrl="https://example.com/privacy"
	>
		<span />
	</InthProvider>
);

export const missingURL = (
	// @ts-expect-error -- presenting needs the privacy-policy URL.
	<InthProvider>
		<span />
	</InthProvider>
);

export const presentsWithoutURL = (
	// @ts-expect-error -- `autoPresent` on still needs the URL.
	<InthProvider autoPresent>
		<span />
	</InthProvider>
);
