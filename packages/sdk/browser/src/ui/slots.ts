import type { AllThemeKeys, ComponentSlots } from '@inth/sdk-ui/theme';
import { toCSSDeclarations } from '@inth/sdk-ui/utils';

/**
 * The `theme.slots` keys the stock UI renders, the same keys `@inth/sdk/ui`
 * and `@inth/svelte` read. Each names one element, which also carries the
 * key as a CSS part so page CSS can reach it through `::part()`.
 */
export type BrowserSlotKey = Extract<
	AllThemeKeys,
	| 'consentBanner'
	| 'consentBannerCard'
	| 'consentBannerHeader'
	| 'consentBannerTitle'
	| 'consentBannerDescription'
	| 'consentBannerFooter'
	| 'consentBannerFooterSubGroup'
	| 'consentBannerRightLink'
	| 'consentBannerTag'
	| 'consentBannerOverlay'
	| 'consentBannerExpand'
	| 'consentBannerRightsRow'
	| 'consentBannerSaveButton'
	| 'consentDialog'
	| 'consentDialogCard'
	| 'consentDialogHeader'
	| 'consentDialogTitle'
	| 'consentDialogDescription'
	| 'consentDialogContent'
	| 'consentDialogTag'
	| 'consentDialogOverlay'
	| 'consentDialogSheet'
	| 'consentDialogFooter'
	| 'consentDialogDoneButton'
	| 'consentDialogSaveButton'
	| 'consentDialogPreferencesRow'
	| 'consentDialogRightsRow'
	| 'consentDialogReceipt'
	| 'consentDialogCategoryGroup'
	| 'consentDialogVendorTable'
	| 'optOutConfirmation'
	| 'optOutConfirmationCard'
	| 'optOutConfirmationHeader'
	| 'optOutConfirmationTitle'
	| 'optOutConfirmationStatus'
	| 'optOutConfirmationDescription'
	| 'optOutConfirmationFooter'
	| 'optOutConfirmationDoneButton'
	| 'optOutConfirmationPreferencesLink'
	| 'optOutConfirmationOverlay'
	| 'consentDialogTrigger'
	| 'consentDialogTriggerIcon'
	| 'consentWidget'
	| 'consentWidgetOptOut'
	| 'consentWidgetOptOutStatus'
	| 'consentWidgetAccordion'
	| 'consentWidgetFooter'
	| 'consentWidgetFooterSubGroup'
	| 'consentWidgetTag'
	| 'iabConsentBanner'
	| 'iabConsentBannerCard'
	| 'iabConsentBannerHeader'
	| 'iabConsentBannerFooter'
	| 'iabConsentBannerTag'
	| 'iabConsentBannerOverlay'
	| 'iabConsentDialog'
	| 'iabConsentDialogCard'
	| 'iabConsentDialogHeader'
	| 'iabConsentDialogFooter'
	| 'iabConsentDialogTag'
	| 'iabConsentDialogOverlay'
	| 'buttonPrimary'
	| 'buttonSecondary'
	| 'toggle'
>;

/**
 * Marks an element as a slot and applies the theme's overrides for it.
 * Passes `null` through, for parts that may not render.
 *
 * An element that answers to several slots takes them all, later keys
 * winning where they set the same style. A `noStyle` on any of them drops
 * only the stock classes, never another slot's.
 */
export type SlotApplier = <ElementType extends HTMLElement | null>(
	element: ElementType,
	key: BrowserSlotKey | readonly BrowserSlotKey[]
) => ElementType;

/**
 * Build the function surfaces call on each slotted element.
 *
 * The element gets the slot key in its `part` attribute, the slot's
 * classes after the stock ones, and the slot's `style` inline. A slot with
 * `noStyle: true` replaces the stock classes of that element instead.
 * Slot classes stay when the mount's `noStyle` drops the stock ones, the
 * way `resolveStyles` in `@inth/sdk/ui` keeps overrides.
 */
export const createSlotApplier = function createSlotApplier(
	slots: ComponentSlots | undefined
): SlotApplier {
	return (element, key) => {
		if (!element) {
			return element;
		}
		const keys: readonly BrowserSlotKey[] =
			typeof key === 'string' ? [key] : key;
		// `part` is a token list, like `class`; applying twice is a no-op.
		const parts = element.getAttribute('part')?.split(/\s+/u) ?? [];
		const added = keys.filter((name) => !parts.includes(name));
		if (added.length > 0) {
			element.setAttribute(
				'part',
				[...parts, ...added].filter(Boolean).join(' ')
			);
		}
		const values = keys.flatMap((name) => {
			const value = slots?.[name];
			if (!value) {
				return [];
			}
			return [typeof value === 'string' ? { className: value } : value];
		});
		if (values.some((value) => value.noStyle)) {
			element.removeAttribute('class');
		}
		for (const { className, style } of values) {
			const names = className?.split(/\s+/u).filter(Boolean) ?? [];
			if (names.length > 0) {
				element.classList.add(...names);
			}
			// Numbers get `px` where the property takes a unit, as React does.
			for (const [property, declared] of toCSSDeclarations(style)) {
				element.style.setProperty(property, declared);
			}
		}
		return element;
	};
};
