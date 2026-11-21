import type { ConsentSnapshot, PresentationAction } from '@inth/sdk-core';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk-core/runtime/page-globals';
import { saveConsentSurfaceWithOptInCheck } from '@inth/sdk-core/surface-actions';
import { setupFocusTrap, setupScrollLock } from '@inth/sdk-ui/utils';

import { dropRejection } from '../drop-rejection';
import { classes } from '../generated/styles';
import type { AdoptedBanner } from '../init/boot';
import type { ConsentBannerOptions } from '../types';
import { renderActionFooter, resolveActions } from './actions';
import { renderBranding } from './branding';
import { resolveCopy } from './copy';
import { h, markLateEntry, readDurationMs, supportsStartingStyle } from './dom';
import { createOptOutIcon } from './opt-out-icon';
import { renderLegalLinks } from './surface';
import type { Surface, SurfaceContext } from './surface';

const DEFAULT_DURATION_MS = 200;

/** The banner surface, which can hand its elements to another banner. */
export interface BannerSurface extends Surface {
	/**
	 * Stop managing the banner on screen and hand over its elements, still
	 * in the document, or `null` when none is shown. The init script hands
	 * its banner to the engine's this way.
	 */
	handoff: () => AdoptedBanner | null;
}

/**
 * The cookie banner.
 *
 * Reuses the framework banners' stylesheet classes and test IDs.
 * Shows when the kernel requests a category choice or notice prompt.
 *
 * @param adopted - A banner another surface rendered (the init script's).
 * The first sync rebuilds it in place without an entry animation, or hides
 * it when no banner is due.
 */
// oxlint-disable-next-line max-lines-per-function -- Build, show, hide and reconcile are one lifecycle.
export const createBanner = function createBanner(
	ctx: SurfaceContext,
	options: ConsentBannerOptions,
	adopted?: AdoptedBanner
): BannerSurface {
	const styles = classes.banner;
	const { noStyle, slot } = ctx;
	const disableAnimation = options.disableAnimation ?? ctx.disableAnimation;
	let trapFocus = false;
	let scrollLock = false;

	let element: HTMLElement | null = adopted?.element ?? null;
	let overlay: HTMLElement | null = adopted?.overlay ?? null;
	let cleanups: (() => void)[] = adopted ? [adopted.release] : [];
	// An adopted banner stays as it is until this kernel's policy arrives;
	// hiding it while the policy is pending would flash it out and in.
	let holdingAdopted = adopted !== undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let renderedFrom: {
		translations: ConsentSnapshot['translations'];
		policyRule: ConsentSnapshot['policyRule'];
		branding: ConsentSnapshot['branding'];
		experiment: ConsentSnapshot['experiment'];
	} | null = null;

	// oxlint-disable-next-line complexity -- Notice copy, action labels and presentation are resolved together.
	const build = function build(snapshot: ConsentSnapshot): HTMLElement {
		const actions = resolveActions(
			snapshot,
			'prompt',
			ctx.client.presentation,
			{
				scrollLock: options.scrollLock,
				trapFocus: options.trapFocus,
			},
			ctx.client.theme
		);
		const copy = resolveCopy(snapshot, actions.optOutLink);
		const { t } = copy;
		const labels: Record<PresentationAction, string> = {
			...copy.actions,
			accept: options.acceptButtonText ?? copy.actions.accept,
			customize: options.customizeButtonText ?? copy.actions.customize,
			reject: options.rejectButtonText ?? copy.actions.reject,
		};
		const title = options.title ?? copy.prompt.title;
		const description = options.description ?? copy.prompt.description;
		({ trapFocus, scrollLock } = actions);
		const { position } = actions;

		const card = slot(
			h(
				'div',
				{
					'aria-label': title,
					'aria-modal': trapFocus ? 'true' : undefined,
					class: noStyle ? '' : styles.card,
					'data-testid': 'consent-banner-card',
					role: trapFocus ? 'dialog' : 'region',
					tabindex: trapFocus ? '-1' : undefined,
				},
				slot(
					h(
						'div',
						{
							class: noStyle ? '' : styles.header,
							'data-testid': 'consent-banner-header',
						},
						slot(
							h(
								'h2',
								{
									class: noStyle ? '' : styles.title,
									'data-testid': 'consent-banner-title',
								},
								title
							),
							'consentBannerTitle'
						),
						slot(
							h(
								'div',
								{
									class: noStyle ? '' : styles.description,
									'data-context': 'banner',
									'data-testid': 'consent-banner-description',
								},
								description,
								...renderLegalLinks({
									keys: options.legalLinks,
									labels: t.legalLinks,
									legalLinks: ctx.legalLinks,
									noStyle,
									testIdPrefix: 'consent-banner-legal-link',
								})
							),
							'consentBannerDescription'
						)
					),
					'consentBannerHeader'
				),
				renderActionFooter({
					actions,
					buttonTestId: (action) => `consent-banner-${action}-button`,
					footerClassName: styles.footer,
					footerSlot: 'consentBannerFooter',
					groupSlot: 'consentBannerFooterSubGroup',
					label: (action) => labels[action],
					noStyle,
					onAction: (action) => {
						if (action === 'accept') {
							dropRejection(
								saveConsentSurfaceWithOptInCheck(
									ctx.client.kernel,
									'all',
									() =>
										ctx.client.kernel.commands.save('all', {
											categories: ctx.client.consentCategories,
											uiSource: 'banner',
										}),
									{ categories: ctx.client.consentCategories }
								)
							);
						} else if (action === 'reject') {
							dropRejection(ctx.client.rejectAll());
						} else if (action === 'dismiss') {
							dropRejection(ctx.client.dismissNotice());
						} else {
							ctx.client.openDialog();
						}
					},
					slot,
					subGroupTestId: 'consent-banner-footer-sub-group',
					testId: 'consent-banner-footer',
					theme: ctx.client.theme,
				})
			),
			'consentBannerCard'
		);

		for (const control of actions.preferenceControls) {
			let content: (Node | string)[];
			if (control === 'opt-out') {
				content =
					copy.optOutLink.variant === 'privacy-choices'
						? [
								createOptOutIcon(noStyle ? '' : styles.optOutIcon),
								copy.optOutLink.label,
							]
						: [copy.optOutLink.label];
			} else {
				content = [copy.controls[control]];
			}
			card.append(
				slot(
					h(
						'button',
						{
							class: noStyle ? '' : classes.button.button,
							'data-action': control === 'opt-out' ? 'opt-out' : 'customize',
							'data-mode': noStyle ? undefined : 'stroke',
							'data-opt-out-variant':
								control === 'opt-out' ? copy.optOutLink.variant : undefined,
							'data-size': noStyle ? undefined : 'small',
							'data-testid': `consent-banner-right-${control}-button`,
							'data-variant': noStyle ? undefined : 'neutral',
							onclick: () => {
								if (control === 'opt-out') {
									dropRejection(ctx.client.optOut());
								} else {
									ctx.client.openDialog();
								}
							},
							type: 'button',
						},
						...content
					),
					'consentBannerRightLink'
				)
			);
		}

		const root = slot(
			h(
				'div',
				{
					class: noStyle ? '' : styles.root,
					'data-blocking': String(actions.blocking),
					'data-position': position,
					'data-testid': 'consent-banner-root',
					[SURFACE_ROOT_ATTRIBUTE]: 'banner',
					'data-variant': actions.variant,
					dir: copy.dir,
					lang: copy.language,
				},
				h(
					'div',
					{ class: noStyle ? '' : styles.cardShell },
					slot(
						renderBranding({
							branding: snapshot.branding,
							hide: options.hideBranding ?? false,
							noStyle,
							securedBy: t.common.securedBy,
							surface: 'banner',
						}),
						'consentBannerTag'
					),
					card
				)
			),
			'consentBanner'
		);

		return root;
	};

	const removeNow = function removeNow(): void {
		if (hideTimer !== undefined) {
			clearTimeout(hideTimer);
			hideTimer = undefined;
		}
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups = [];
		element?.remove();
		overlay?.remove();
		element = null;
		overlay = null;
		renderedFrom = null;
	};

	const show = function show(
		snapshot: ConsentSnapshot,
		entering: boolean
	): void {
		removeNow();
		element = build(snapshot);
		renderedFrom = {
			branding: snapshot.branding,
			experiment: snapshot.experiment,
			policyRule: snapshot.policyRule,
			translations: snapshot.translations,
		};
		if (scrollLock) {
			overlay = slot(
				h('div', {
					'aria-hidden': 'true',
					class: noStyle ? '' : styles.overlay,
					'data-testid': 'consent-banner-overlay',
					role: 'presentation',
				}),
				'consentBannerOverlay'
			);
		}
		// The state classes go on before insertion so the first style the
		// browser computes already includes them; the scroll lock reads
		// layout, which would otherwise fix the bare state as the start.
		const flip = !(noStyle || disableAnimation || supportsStartingStyle());
		if (!noStyle) {
			if (flip) {
				element.classList.add(styles.bannerHidden);
				overlay?.classList.add(styles.overlayHidden);
			} else {
				element.classList.add(styles.bannerVisible);
				overlay?.classList.add(styles.overlayVisible);
			}
			if (!disableAnimation) {
				// The entering classes mark the mount. The banner shows on
				// this frame, unless it is marked late below. On the flip
				// path they sit under the hidden state until the flip.
				element.classList.add(styles.bannerEntering);
				overlay?.classList.add(styles.overlayEntering);
			}
		}
		if (entering) {
			markLateEntry([element, overlay]);
		}
		if (overlay) {
			ctx.root.append(overlay);
		}
		ctx.root.append(element);
		const card = element.querySelector<HTMLElement>('[role="dialog"]');
		if (trapFocus && card) {
			cleanups.push(setupFocusTrap(card));
		}
		if (scrollLock) {
			cleanups.push(setupScrollLock());
		}
		if (flip) {
			// Without `@starting-style`, the mount starts hidden and flips.
			// The visible state has no transition, so the banner shows at
			// once, unless it is marked late and the entering rule fades it
			// in; the forced layout keeps the flip a style change.
			void element.offsetHeight;
			element.classList.replace(styles.bannerHidden, styles.bannerVisible);
			overlay?.classList.replace(styles.overlayHidden, styles.overlayVisible);
		}
	};

	const hide = function hide(): void {
		if (!element || hideTimer !== undefined) {
			return;
		}
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups = [];
		if (noStyle || disableAnimation) {
			removeNow();
			return;
		}
		const duration = readDurationMs(
			element,
			'--consent-banner-animation-duration',
			DEFAULT_DURATION_MS
		);
		element.classList.replace(styles.bannerVisible, styles.bannerHidden);
		overlay?.classList.replace(styles.overlayVisible, styles.overlayHidden);
		hideTimer = setTimeout(removeNow, duration);
	};

	return {
		destroy() {
			removeNow();
		},
		handoff() {
			if (!element || hideTimer !== undefined) {
				return null;
			}
			const released = cleanups;
			const handed = {
				element,
				overlay,
				release: () => {
					for (const cleanup of released) {
						cleanup();
					}
				},
			};
			cleanups = [];
			element = null;
			overlay = null;
			renderedFrom = null;
			return handed;
		},
		sync(snapshot) {
			if (holdingAdopted && snapshot.policyPending) {
				return;
			}
			holdingAdopted = false;
			const shouldShow =
				snapshot.activeUI === 'banner' &&
				snapshot.policyRule.model !== 'iab' &&
				snapshot.policyRule.prompt !== 'none';
			if (!shouldShow) {
				hide();
				return;
			}
			const onScreen = element !== null && hideTimer === undefined;
			if (
				onScreen &&
				renderedFrom &&
				renderedFrom.translations === snapshot.translations &&
				renderedFrom.policyRule === snapshot.policyRule &&
				renderedFrom.branding === snapshot.branding &&
				renderedFrom.experiment === snapshot.experiment
			) {
				return;
			}
			// A banner already on screen rebuilds in place, for new copy or a
			// new policy, rather than entering again.
			show(snapshot, !(onScreen || disableAnimation));
		},
	};
};
