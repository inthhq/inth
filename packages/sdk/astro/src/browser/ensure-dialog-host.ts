/**
 * Where a dialog island mounts, and what the page's `<ConsentDialog />`
 * asks of it. Small, so the first-load shell can open a dialog before the
 * engine loads; the engine's client uses the same helpers.
 *
 * @internal
 */

import type { LegalLinks } from '@inth/sdk/engine';

import type { ConsentDialogKind } from '../ui/register-dialog-adapter';

/** The element dialog islands mount into. @internal */
export const DIALOG_HOST_ID = 'inth-dialog-host';

/**
 * The element dialog islands mount into, added to `<body>` on first use.
 *
 * @internal
 */
export const ensureDialogHost = function ensureDialogHost(): HTMLElement {
	const existing = document.getElementById(DIALOG_HOST_ID);
	if (existing) {
		return existing;
	}
	const host = document.createElement('div');
	host.id = DIALOG_HOST_ID;
	document.body.appendChild(host);
	return host;
};

/**
 * The legal links `<ConsentDialog legalLinks>` asked for.
 *
 * Read when the island mounts rather than at boot, so the list follows
 * the page a ClientRouter navigation swapped in.
 *
 * @returns The link keys, or `undefined` when the page left them unset.
 *   `legalLinks={null}` reads as an empty list, so the dialog hides its
 *   footer link.
 * @internal
 */
export const readDialogLegalLinks = function readDialogLegalLinks():
	| (keyof LegalLinks)[]
	| undefined {
	const value = document
		.querySelector('[data-inth-dialog-host="preferences"]')
		?.getAttribute('data-legal-links');
	if (value === null || value === undefined) {
		return undefined;
	}
	return value.split(/\s+/u).filter(Boolean) as (keyof LegalLinks)[];
};

/**
 * The `disableAnimation` prop of the `<ConsentDialog />` or
 * `<IABConsentDialog />` on the page.
 *
 * Read when the island mounts, like the legal links, so it follows the
 * page a ClientRouter navigation swapped in.
 *
 * @returns The prop, or `undefined` when the page left it unset.
 * @internal
 */
export const readDialogDisableAnimation = function readDialogDisableAnimation(
	kind: ConsentDialogKind
): boolean | undefined {
	const value =
		document
			.querySelector(`[data-inth-dialog-host="${kind}"]`)
			?.getAttribute('data-disable-animation') ??
		(kind === 'preferences'
			? document
					.querySelector('[data-inth-opt-out-confirmation-host]')
					?.getAttribute('data-disable-animation')
			: null);
	if (value === 'true' || value === 'false') {
		return value === 'true';
	}
	return undefined;
};
