'use client';

import type {
	ConsentExperiment,
	ConsentPresentation,
	LegalLinks,
} from '@inth/sdk/engine';
import { createContext, useContext } from 'react';

import type { ReactComponentSlots } from '~/types/react-slots.model';
import type { Theme } from '~/types/theme';
import type { DialogPreload } from '~/warm-dialog-chunk';

export interface V3UIConfigValue {
	components?: ReactComponentSlots;
	/** The host's base presentation, before any experiment arm is applied. */
	presentation?: ConsentPresentation;
	/** The configured experiment; the assigned arm lives on the snapshot. */
	experiment?: ConsentExperiment;
	/** The host's base theme, before any experiment arm is applied. */
	theme?: Theme;
	legalLinks?: LegalLinks;
	preloadDialog?: DialogPreload;
	/** CSP nonce for the `<style>` elements the surfaces render. */
	nonce?: string;
	/** `false` when the app loads `styles.css` itself. */
	styles?: boolean;
}

export const V3UIConfigContext = createContext<V3UIConfigValue>({});
V3UIConfigContext.displayName = 'InthV3UIConfigContext';

export const useUIConfig = function useUIConfig() {
	return useContext(V3UIConfigContext);
};
