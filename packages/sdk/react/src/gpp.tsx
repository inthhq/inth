'use client';

/**
 * `@inth/react/gpp` — IAB GPP for a React consent provider.
 *
 * A separate entry, like `@inth/react/iab`, so apps that do not render
 * {@link ConsentGPP} bundle none of the GPP code.
 *
 * @packageDocumentation
 */

import type { AllConsentNames } from '@inth/sdk/engine';
import { createGPP } from '@inth/sdk/iab/gpp';
import type { RuntimeGPPOptions } from '@inth/sdk/runtime';
import { useContext, useEffect } from 'react';

import { KernelContext } from './context';

/** Props for {@link ConsentGPP}: the GPP options, all optional. */
export type ConsentGPPProps = RuntimeGPPOptions;

/**
 * Installs `window.__gpp`, the IAB GPP CMP API, on the surrounding
 * provider's kernel and keeps its GPP string in step with the visitor's
 * choices. Renders nothing. Unmounting removes `__gpp`.
 *
 * Render it inside `InthProvider`, from `@inth/react`, `@inth/nextjs` or
 * `@inth/tanstack-start`. Every prop is plain data, so a Server Component can
 * render it.
 *
 * @param props - GPP options. See `RuntimeGPPOptions`.
 * @returns `null`.
 * @throws {Error} When rendered outside a consent provider.
 *
 * @example
 * ```tsx
 * import { ConsentGPP } from '@inth/react/gpp';
 *
 * <InthProvider options={{ mode: hosted({ projectUrl }) }}>
 *   <ConsentGPP usFallback="none" />
 *   <App />
 * </InthProvider>
 * ```
 */
export const ConsentGPP = ({
	cmpId,
	mspaMode,
	optOutCategories,
	tcf,
	usApproach,
	usFallback,
}: ConsentGPPProps): null => {
	const kernel = useContext(KernelContext);
	if (!kernel) {
		throw new Error(
			'inth: ConsentGPP must be rendered inside <InthProvider> from @inth/react.'
		);
	}
	// A key, so an inline array does not remount the API on every render.
	const categories = optOutCategories?.join(',');

	useEffect(() => {
		let parsedCategories: AllConsentNames[] | undefined;
		if (categories !== undefined) {
			parsedCategories =
				categories === '' ? [] : (categories.split(',') as AllConsentNames[]);
		}
		let handle: ReturnType<typeof createGPP> | null = null;
		try {
			handle = createGPP({
				cmpId,
				kernel,
				mspaMode,
				optOutCategories: parsedCategories,
				tcf,
				usApproach,
				usFallback,
			});
		} catch (error) {
			// Another CMP owns `__gpp`; consent keeps working without it.
			// oxlint-disable-next-line no-console -- Integration diagnostic.
			console.error('inth: GPP was not installed.', error);
		}
		return () => handle?.dispose();
	}, [categories, cmpId, kernel, mspaMode, tcf, usApproach, usFallback]);

	return null;
};
