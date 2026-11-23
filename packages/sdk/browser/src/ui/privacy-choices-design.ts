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
import {
	hasOptOutConfirmationHost,
	isOptInConfirmationOpen,
	isOptOutConfirmationOpen,
	showConsentSurface,
} from '@inth/sdk-core/surface-actions';

import type { AdoptedBanner } from '../init/boot';
import type { ConsentBannerOptions, ConsentDialogOptions } from '../types';
import { resolveActions } from './actions';
import { createBanner } from './banner';
import type { BannerSurface } from './banner';
import {
	importOptInConfirmation,
	importPanel,
	importPresentation,
	importPrivacyChoicesDialog,
} from './privacy-choices/pc-import';
import type {
	PrivacyChoicesActionGroups,
	PrivacyChoicesBanner,
	PrivacyChoicesContainer,
} from './privacy-choices/surface';
import { requestReceiptFocus } from './receipt-focus';
import type { Surface, SurfaceContext } from './surface';

/**
 * The prompt's container and the first-layer actions the policy allows
 * when the Privacy Choices design applies, else `null` for the classic
 * design.
 */
const privacyChoicesPrompt = function privacyChoicesPrompt(
	ctx: SurfaceContext,
	snapshot: ConsentSnapshot,
	options: Pick<ConsentBannerOptions, 'scrollLock' | 'trapFocus'>
): {
	container: PrivacyChoicesContainer;
	actionGroups: PrivacyChoicesActionGroups;
} | null {
	const resolved = resolveActions(
		snapshot,
		'prompt',
		ctx.client.presentation,
		{ scrollLock: options.scrollLock, trapFocus: options.trapFocus },
		ctx.client.theme
	);
	return resolved.design === 'privacy-choices' && resolved.container
		? { actionGroups: resolved.actionGroups, container: resolved.container }
		: null;
};

/**
 * The prompt's container when the Privacy Choices design applies, else
 * `null` for the classic design.
 */
export const privacyChoicesContainer = function privacyChoicesContainer(
	ctx: SurfaceContext,
	snapshot: ConsentSnapshot,
	options: Pick<ConsentBannerOptions, 'scrollLock' | 'trapFocus'> = {}
): PrivacyChoicesContainer | null {
	return privacyChoicesPrompt(ctx, snapshot, options)?.container ?? null;
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
	/** Counts loads, so a load a newer one replaced is ignored. */
	let loads = 0;
	let latest: {
		snapshot: ConsentSnapshot;
		container: PrivacyChoicesContainer;
		actionGroups: PrivacyChoicesActionGroups;
	} | null = null;
	let owed = false;
	let classicShown = true;
	let destroyed = false;

	const load = function load(type: string): void {
		if (loadingType === type) {
			return;
		}
		loadingType = type;
		loads += 1;
		const ticket = loads;
		importPresentation(type as PrivacyChoicesContainer['desktop']['type']).then(
			(module) => {
				if (destroyed || ticket !== loads) {
					return;
				}
				loadingType = null;
				prompt?.destroy();
				prompt = module.createSurface(ctx, options);
				promptType = type;
				if (latest) {
					prompt.sync(latest.snapshot, latest.container, latest.actionGroups);
				}
			},
			(error: unknown) => {
				// The classic banner has left, so the visitor has no prompt
				// until this loads: the next sync tries again.
				if (ticket === loads) {
					loadingType = null;
				}
				reportLoadError(error);
			}
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
			const resolved = privacyChoicesPrompt(ctx, snapshot, options);
			if (!resolved) {
				latest = null;
				prompt?.hide();
				classicShown = true;
				classic.sync(snapshot);
				return;
			}
			const { actionGroups, container } = resolved;
			if (classicShown) {
				// The classic banner, the init script's included, leaves at
				// once. It stays ready for a later switch back to the classic
				// design, as by an experiment.
				classicShown = false;
				classic.destroy();
			}
			latest = { actionGroups, container, snapshot };
			owed ||= snapshot.activeUI === 'banner';
			if (!owed) {
				return;
			}
			const { type } = container.desktop;
			prompt?.sync(snapshot, container, actionGroups);
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
 *
 * On either design this surface hosts the opt-in confirmation, which the
 * Privacy Choices design loads on its own, without the classic dialog. The
 * Privacy Choices design confirms an opt-out on its receipt: the opt-out
 * confirmation (after a revocation reload, or from a one-click opt-out
 * link) opens the dialog there instead.
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
	let optIn: Surface | null = null;
	let optInLoading = false;
	let adopting = false;

	const loadOptIn = function loadOptIn(): void {
		if (optIn || optInLoading || destroyed) {
			return;
		}
		optInLoading = true;
		importOptInConfirmation().then(
			(module) => {
				optInLoading = false;
				if (destroyed || !latest) {
					return;
				}
				optIn = module.createOptInConfirmation(ctx, options);
				optIn.sync(latest);
			},
			(error: unknown) => {
				optInLoading = false;
				// oxlint-disable-next-line no-console -- The confirmation failed to load.
				console.error(
					'@inth/sdk: the opt-in confirmation failed to load.',
					error
				);
			}
		);
	};

	/** Open the dialog on its receipt in place of the opt-out confirmation. */
	const adoptOptOutConfirmation = function adoptOptOutConfirmation(): void {
		if (adopting) {
			return;
		}
		adopting = true;
		// After the sync that saw it, so the kernel is not re-entered.
		queueMicrotask(() => {
			adopting = false;
			const { kernel } = ctx.client;
			if (
				destroyed ||
				!latest ||
				!isOptOutConfirmationOpen(kernel) ||
				hasOptOutConfirmationHost(kernel)
			) {
				return;
			}
			requestReceiptFocus(kernel);
			// Opening the dialog closes the confirmation.
			showConsentSurface(kernel, 'dialog');
		});
	};

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
			optIn?.destroy();
			optIn = null;
		},
		sync(snapshot) {
			if (!privacyChoicesContainer(ctx, snapshot)) {
				latest = null;
				dialog?.destroy();
				dialog = null;
				// The classic dialog hosts its own confirmations.
				optIn?.destroy();
				optIn = null;
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
			const { kernel } = ctx.client;
			if (optIn) {
				optIn.sync(snapshot);
			} else if (isOptInConfirmationOpen(kernel)) {
				loadOptIn();
			}
			if (
				snapshot.policyRule.model !== 'iab' &&
				isOptOutConfirmationOpen(kernel) &&
				!hasOptOutConfirmationHost(kernel)
			) {
				adoptOptOutConfirmation();
			}
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
