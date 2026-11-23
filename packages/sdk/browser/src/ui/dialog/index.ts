// Promise chains, not async functions: this module is on first load, and
// the async form costs bytes there.
/* oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks, promise/prefer-catch */
/**
 * The stock dialog: "Your Privacy Choices", loaded when it opens and warmed
 * in idle time while a banner or the trigger can open it, never with the
 * banner (PERM-05: the banner leaves at once when it opens).
 *
 * This surface also hosts the opt-in confirmation, which loads on its own.
 * An opt-out confirmation (after a revocation reload, or from a one-click
 * opt-out link) opens the dialog on its receipt instead.
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

import type { ConsentDialogOptions } from '../../types';
import {
	importDialog,
	importOptInConfirmation,
	importPanel,
} from '../parts/load';
import { requestReceiptFocus } from '../parts/receipt-focus';
import type { Surface, SurfaceContext } from '../surface';

// Safari has no requestIdleCallback; a short delay stands in.
const IDLE_FALLBACK_DELAY_MS = 200;

/** Run `work` once the browser is idle, unless the visitor saves data. */
const whenIdle = function whenIdle(work: () => void): void {
	const { connection } = navigator as Navigator & {
		connection?: { saveData?: boolean };
	};
	if (connection?.saveData === true) {
		return;
	}
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(work);
	} else {
		window.setTimeout(work, IDLE_FALLBACK_DELAY_MS);
	}
};

/**
 * The stock dialog.
 *
 * @param warmOnMount - Truthy when something else on screen opens the
 * dialog (the trigger options), so it warms without a banner.
 */
export const createDialog = function createDialog(
	ctx: SurfaceContext,
	options: ConsentDialogOptions,
	warmOnMount?: unknown
): Surface {
	let dialog: Surface | null = null;
	let loading = false;
	let latest: ConsentSnapshot | null = null;
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
		importDialog().then(
			(module) => {
				loading = false;
				if (destroyed) {
					return;
				}
				dialog = module.createConsentDialog(ctx, options);
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

	/**
	 * A shown banner can open the dialog, or its options, at any moment, and
	 * so can the trigger: warm both in idle time, as React warms them
	 * together.
	 */
	const warm = function warm(): void {
		if (warming) {
			return;
		}
		warming = true;
		whenIdle(() => {
			load();
			importPanel().catch(() => {
				/* Customize retries */
			});
		});
	};

	return {
		destroy() {
			destroyed = true;
			dialog?.destroy();
			dialog = null;
			optIn?.destroy();
			optIn = null;
		},
		sync(snapshot) {
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
			} else if (
				snapshot.policyRule.model !== 'iab' &&
				(snapshot.activeUI === 'banner' || warmOnMount)
			) {
				warm();
			}
		},
	};
};
