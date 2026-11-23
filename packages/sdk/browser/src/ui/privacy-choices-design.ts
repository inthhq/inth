// Promise chains, not async functions: see `./dialog-surface.ts`.
/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks, promise/prefer-catch */
/**
 * Which design the stock surfaces render, and the switch between them.
 *
 * The classic banner and dialog stay as they are. When `presentation.design`
 * resolves to `'privacy-choices'` (core's `resolveConsentPresentation`, as
 * in React), the banner and dialog surfaces hand over to the Privacy
 * Choices ones in `./privacy-choices/`, which load on demand: a page on the
 * classic design loads none of them.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk-core';

import type { AdoptedBanner } from '../init/boot';
import type { ConsentBannerOptions, ConsentDialogOptions } from '../types';
import { resolveActions } from './actions';
import { createBanner } from './banner';
import type { BannerSurface } from './banner';
import {
	importPanel,
	importPresentation,
	importPrivacyChoicesDialog,
} from './privacy-choices/pc-import';
import type {
	PrivacyChoicesBanner,
	PrivacyChoicesContainer,
} from './privacy-choices/surface';
import type { Surface, SurfaceContext } from './surface';

/**
 * The prompt's container when the Privacy Choices design applies, else
 * `null` for the classic design.
 */
export const privacyChoicesContainer = function privacyChoicesContainer(
	ctx: SurfaceContext,
	snapshot: ConsentSnapshot,
	options: Pick<ConsentBannerOptions, 'scrollLock' | 'trapFocus'> = {}
): PrivacyChoicesContainer | null {
	const resolved = resolveActions(
		snapshot,
		'prompt',
		ctx.client.presentation,
		{ scrollLock: options.scrollLock, trapFocus: options.trapFocus },
		ctx.client.theme
	);
	return resolved.design === 'privacy-choices' ? resolved.container : null;
};

// Safari has no requestIdleCallback; a short delay stands in.
const IDLE_FALLBACK_DELAY_MS = 200;

const reportLoadError = (error: unknown): void => {
	// oxlint-disable-next-line no-console -- A Privacy Choices part failed to load.
	console.error('@inth/sdk: the consent banner failed to load.', error);
};

/**
 * The stock banner: the classic one, or the Privacy Choices prompt for the
 * resolved container. The prompt loads once a choice is owed, and stays
 * mounted after, so its exit, the page announcement and the focus return
 * outlive it.
 */
export const createBannerSurface = function createBannerSurface(
	ctx: SurfaceContext,
	options: ConsentBannerOptions,
	adopted?: AdoptedBanner
): BannerSurface {
	const classic = createBanner(ctx, options, adopted);
	let prompt: PrivacyChoicesBanner | null = null;
	let promptType: string | null = null;
	let loadingType: string | null = null;
	let latest: {
		snapshot: ConsentSnapshot;
		container: PrivacyChoicesContainer;
	} | null = null;
	let owed = false;
	let destroyed = false;

	const load = function load(type: string): void {
		if (loadingType === type) {
			return;
		}
		loadingType = type;
		importPresentation(type as PrivacyChoicesContainer['desktop']['type']).then(
			(module) => {
				if (destroyed || loadingType !== type) {
					return;
				}
				loadingType = null;
				prompt?.destroy();
				prompt = module.createSurface(ctx, options);
				promptType = type;
				if (latest) {
					prompt.sync(latest.snapshot, latest.container);
				}
			},
			reportLoadError
		);
	};

	return {
		destroy() {
			destroyed = true;
			classic.destroy();
			prompt?.destroy();
			prompt = null;
		},
		handoff: () => classic.handoff(),
		sync(snapshot) {
			const container = privacyChoicesContainer(ctx, snapshot, options);
			if (!container) {
				latest = null;
				prompt?.hide();
				classic.sync(snapshot);
				return;
			}
			// The classic banner leaves at once, the init script's included.
			classic.destroy();
			latest = { container, snapshot };
			owed ||= snapshot.activeUI === 'banner';
			if (!owed) {
				return;
			}
			const { type } = container.desktop;
			prompt?.sync(snapshot, container);
			if (promptType !== type) {
				load(type);
			}
		},
	};
};

/**
 * The stock dialog: the classic preference centre, or the Privacy Choices
 * dialog when the design opts in. The Privacy Choices dialog loads when it
 * opens, warmed while a banner shows, never with the banner (PERM-05: the
 * banner leaves at once when it opens).
 */
export const withPrivacyChoicesDialog = function withPrivacyChoicesDialog(
	ctx: SurfaceContext,
	options: ConsentDialogOptions,
	classic: Surface
): Surface {
	let dialog: Surface | null = null;
	let loading = false;
	let latest: ConsentSnapshot | null = null;
	let classicShown = false;
	let warming = false;
	let destroyed = false;

	const load = function load(): void {
		if (loading || dialog || destroyed) {
			return;
		}
		loading = true;
		importPrivacyChoicesDialog().then(
			(module) => {
				loading = false;
				if (destroyed) {
					return;
				}
				dialog = module.createPrivacyChoicesDialog(ctx, options);
				if (latest) {
					dialog.sync(latest);
				}
			},
			(error: unknown) => {
				loading = false;
				// oxlint-disable-next-line no-console -- The dialog failed to load.
				console.error(
					'@inth/sdk: the preference centre failed to load.',
					error
				);
			}
		);
	};

	return {
		destroy() {
			destroyed = true;
			classic.destroy();
			dialog?.destroy();
			dialog = null;
		},
		sync(snapshot) {
			if (!privacyChoicesContainer(ctx, snapshot)) {
				latest = null;
				dialog?.destroy();
				dialog = null;
				classicShown = true;
				classic.sync(snapshot);
				return;
			}
			if (classicShown) {
				// The design changed under an open classic dialog: close it.
				classicShown = false;
				classic.sync({ ...snapshot, activeUI: 'none' });
			}
			latest = snapshot;
			if (dialog) {
				dialog.sync(snapshot);
			} else if (snapshot.activeUI === 'dialog') {
				load();
			} else if (snapshot.activeUI === 'banner' && !warming) {
				// A shown banner can open the dialog, or its options, at any
				// moment: warm both in idle time, as React warms them together.
				warming = true;
				const warm = () => {
					load();
					importPanel().catch(() => {
						/* Customize retries */
					});
				};
				if (typeof window.requestIdleCallback === 'function') {
					window.requestIdleCallback(warm);
				} else {
					window.setTimeout(warm, IDLE_FALLBACK_DELAY_MS);
				}
			}
		},
	};
};
