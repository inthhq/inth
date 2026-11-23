'use client';

import type { FC } from 'react';

import {
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	Switch,
	VendorList,
} from './atoms/accordion';
import {
	AcceptAllButton,
	CustomizeButton,
	RejectButton,
	SaveButton,
} from './atoms/button';
import { Footer, FooterSubGroup } from './atoms/footer';
import { OptOut } from './atoms/opt-out';
import { OptOutStatus } from './atoms/opt-out-status';
import { Root } from './atoms/root';
import { ConsentWidget as ConsentWidgetComponent } from './preferences';
import type { ConsentWidgetProps } from './preferences.model';
import { PolicyActions } from './policy-actions';

export type { ConsentWidgetProps };

/**
 * @public
 */
export interface ConsentWidgetCompoundComponent extends FC<ConsentWidgetProps> {
	// Accordion components
	AccordionTrigger: typeof AccordionTrigger;
	AccordionTriggerInner: typeof AccordionTriggerInner;
	AccordionContent: typeof AccordionContent;
	AccordionArrow: typeof AccordionArrow;
	Accordion: typeof Accordion;
	Switch: typeof Switch;
	AccordionItems: typeof AccordionItems;
	AccordionItem: typeof AccordionItem;
	/** Vendor rows for one category, nested by `AccordionItems`. */
	VendorList: typeof VendorList;
	// Root component
	Root: typeof Root;
	/** Direct sale-and-sharing opt-out block above the category list. */
	OptOut: typeof OptOut;
	/** Status banner announcing an honored opt-out above the category list. */
	OptOutStatus: typeof OptOutStatus;
	// Button components
	AcceptAllButton: typeof AcceptAllButton;
	CustomizeButton: typeof CustomizeButton;
	SaveButton: typeof SaveButton;
	RejectButton: typeof RejectButton;
	// Footer components
	PolicyActions: typeof PolicyActions;
	Footer: typeof Footer;
	FooterSubGroup: typeof FooterSubGroup;
}

/**
 * The main consent management widget component.
 * Provides a pre-configured interface for managing privacy consents.
 *
 * @example
 * Basic usage:
 * ```tsx
 * <ConsentWidget
 *   hideBranding={true}
 * />
 * ```
 *
 * @example
 * Preferred stock customization with component slots:
 * ```tsx
 * <InthProvider
 *   options={{
 *     mode: hosted({ projectUrl: '/api/inth' }),
 *     components: {
 *       accordion: {
 *         root: { className: 'rounded-3xl border border-black/10' },
 *       },
 *       manager: {
 *         footer: { className: 'border-t border-black/10' },
 *       },
 *     },
 *   }}
 * >
 *   <ConsentWidget hideBranding />
 * </InthProvider>
 * ```
 *
 * @example
 * Advanced compound components:
 * ```tsx
 * <ConsentWidget.Root>
 *   <ConsentWidget.Accordion>
 *     <ConsentWidget.AccordionItems />
 *   </ConsentWidget.Accordion>
 * </ConsentWidget.Root>
 * ```
 * Note: Next.js Server Components do not support compound components. Ensure you add `'use client'` to the file.
 *
 */
const ConsentWidget = Object.assign(ConsentWidgetComponent, {
	AcceptAllButton,
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	CustomizeButton,
	Footer,
	FooterSubGroup,
	OptOut,
	OptOutStatus,

	PolicyActions,
	RejectButton,
	Root,
	SaveButton,
	Switch,
	VendorList,
}) as ConsentWidgetCompoundComponent;

export default ConsentWidget;

// Export individual components for backward compatibility
export {
	Accordion,
	AccordionArrow,
	AccordionContent,
	AccordionItem,
	AccordionItems,
	AccordionTrigger,
	AccordionTriggerInner,
	ConsentWidgetAccordion,
	ConsentWidgetAccordionArrow,
	ConsentWidgetAccordionContent,
	ConsentWidgetAccordionItem,
	ConsentWidgetAccordionItems,
	ConsentWidgetAccordionTrigger,
	ConsentWidgetAccordionTriggerInner,
	ConsentWidgetSwitch,
	ConsentWidgetVendorList,
	Switch,
	VendorList,
} from './atoms/accordion';
export {
	AcceptAllButton,
	ConsentWidgetAcceptAllButton,
	ConsentWidgetCustomizeButton,
	ConsentWidgetRejectButton,
	ConsentWidgetSaveButton,
	CustomizeButton,
	RejectButton,
	SaveButton,
} from './atoms/button';
export {
	ConsentWidgetFooter,
	ConsentWidgetFooterSubGroup,
	Footer,
	FooterSubGroup,
} from './atoms/footer';
export { ConsentWidgetOptOut, OptOut } from './atoms/opt-out';
export {
	ConsentWidgetOptOutStatus,
	OptOutStatus,
} from './atoms/opt-out-status';
export { ConsentWidgetRoot, Root } from './atoms/root';
export {
	type ConsentWidgetPolicyActionRenderProps,
	ConsentWidgetPolicyActions,
	type ConsentWidgetPolicyActionsProps,
	PolicyActions,
} from './policy-actions';
export { ConsentWidget };
