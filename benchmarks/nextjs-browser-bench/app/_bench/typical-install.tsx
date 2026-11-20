'use client';

import { gtag } from '@inth/integrations/google-tag';
import { metaPixel } from '@inth/integrations/meta-pixel';
import { tiktokPixel } from '@inth/integrations/tiktok-pixel';
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { InthProviderProps } from '@inth/nextjs';
import type { ReactNode } from 'react';

import { NextjsBenchmarkProbe } from './probe';
import { getState } from './state';
import {
	benchVendorScripts,
	typicalInstallConfig,
} from './typical-install-config';

import './with-consent.css';

/**
 * Three common vendors through `@inth/integrations`, as the Next.js scripts
 * guide registers them. Google tag always loads and signals Consent Mode;
 * Meta and TikTok wait for marketing consent. Each points at a local
 * stand-in so the bench measures when Inth starts them, not a CDN.
 */
const scripts = [
	gtag({
		category: 'measurement',
		id: 'G-BENCH00001',
		// gtag has no loader URL option; the script override replaces it.
		script: { src: `${benchVendorScripts.gtag}?id=G-BENCH00001` },
	}),
	metaPixel({
		pixelId: '100000000000001',
		scriptSrc: benchVendorScripts['meta-pixel'],
	}),
	tiktokPixel({
		pixelId: 'BENCHTIKTOK0001',
		scriptSrc: benchVendorScripts['tiktok-pixel'],
	}),
];

const options: InthProviderProps['options'] = {
	callbacks: {
		onChoiceRecorded() {
			const state = getState('typical-install');
			if (state) {
				state.onChoiceRecordedCount += 1;
			}
		},
		onError() {
			const state = getState('typical-install');
			if (state) {
				state.onErrorCount += 1;
			}
		},
	},
	consentCategories: [
		'necessary',
		'functionality',
		'experience',
		'measurement',
		'marketing',
	],
	theme: {
		motion: {
			duration: {
				fast: '1ms',
				normal: '1ms',
				slow: '1ms',
			},
		},
	},
};

/**
 * The quickstart's client wrapper: one `InthProvider` with the config,
 * the scripts, the stock banner and dialog, and a preferences link.
 */
export const TypicalInstallConsent = ({
	children,
	state,
}: {
	children: ReactNode;
	state: InthProviderProps['state'];
}) => (
	<InthProvider
		config={typicalInstallConfig}
		options={options}
		scripts={scripts}
		state={state}
	>
		<NextjsBenchmarkProbe scenario="typical-install" />
		{children}
		<ConsentBanner disableAnimation />
		<ConsentDialog disableAnimation />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);
