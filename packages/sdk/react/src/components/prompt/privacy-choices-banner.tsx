'use client';

import { useState } from 'react';

import { useActiveUI } from '~/hooks';
import { createDeferredModule } from '~/utils/deferred-module';

import type { PrivacyChoicesBannerOptions } from './privacy-choices/surface';

/*
 * One chunk per presentation, each with its own stylesheet, so a page
 * downloads only the presentation it shows. A page that never owes a
 * choice, or keeps the classic design, downloads none of them.
 */
const CardSurface = createDeferredModule(
	() => import('./privacy-choices/card')
).component((module) => module.CardSurface);
const BarSurface = createDeferredModule(
	() => import('./privacy-choices/bar')
).component((module) => module.BarSurface);
const DrawerSurface = createDeferredModule(
	() => import('./privacy-choices/drawer')
).component((module) => module.DrawerSurface);

/**
 * The stock banner's Privacy Choices design (`design: 'privacy-choices'`).
 * It loads the prompt for the resolved container once a choice is owed,
 * and keeps it mounted after, so its exit, the page announcement and the
 * focus return outlive the prompt.
 *
 * @internal
 */
export const PrivacyChoicesBanner = (props: PrivacyChoicesBannerOptions) => {
	const activeUI = useActiveUI();
	const [owed, setOwed] = useState(activeUI === 'banner');
	if (activeUI === 'banner' && !owed) {
		setOwed(true);
	}
	if (!owed) {
		return null;
	}
	switch (props.container.desktop.type) {
		case 'banner':
			return <BarSurface {...props} />;
		case 'drawer':
			return <DrawerSurface {...props} />;
		default:
			return <CardSurface {...props} />;
	}
};
