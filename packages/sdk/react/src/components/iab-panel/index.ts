'use client';

import type { FC } from 'react';

import { FeatureItem } from './atoms/feature-item';
import { IABConsentDialogCard } from './atoms/iab-consent-dialog-card';
import { IABConsentDialogContent } from './atoms/iab-consent-dialog-content';
import { IABConsentDialogFooter } from './atoms/iab-consent-dialog-footer';
import { IABConsentDialogHeader } from './atoms/iab-consent-dialog-header';
import { IABConsentDialogOverlay } from './atoms/iab-consent-dialog-overlay';
import { IABConsentDialogRoot } from './atoms/iab-consent-dialog-root';
import {
	IABConsentDialogTabButton,
	IABConsentDialogTabs,
} from './atoms/iab-consent-dialog-tabs';
import { PurposeItem } from './atoms/purpose-item';
import { StackItem } from './atoms/stack-item';
import { VendorList } from './atoms/vendor-list';
import { IABConsentDialog as IABConsentDialogComponent } from './iab-consent-dialog';
import type { IABConsentDialogProps } from './iab-consent-dialog';

export interface IABConsentDialogCompoundComponent extends FC<IABConsentDialogProps> {
	Root: typeof IABConsentDialogRoot;
	Card: typeof IABConsentDialogCard;
	Header: typeof IABConsentDialogHeader;
	Tabs: typeof IABConsentDialogTabs;
	TabButton: typeof IABConsentDialogTabButton;
	Content: typeof IABConsentDialogContent;
	Footer: typeof IABConsentDialogFooter;
	Overlay: typeof IABConsentDialogOverlay;
	FeatureItem: typeof FeatureItem;
	PurposeItem: typeof PurposeItem;
	StackItem: typeof StackItem;
	VendorList: typeof VendorList;
}

/**
 * IAB TCF 2.4 compliant consent dialog component.
 *
 * @example
 * Simple usage with default settings:
 * ```tsx
 * <IABConsentDialog />
 * ```
 *
 * @example
 * Using compound components for custom layout:
 * ```tsx
 * <IABConsentDialog.Root>
 *   <IABConsentDialog.Card>
 *     <IABConsentDialog.Header />
 *     <IABConsentDialog.Tabs />
 *     <IABConsentDialog.Content>
 *       Custom content
 *     </IABConsentDialog.Content>
 *     <IABConsentDialog.Footer />
 *   </IABConsentDialog.Card>
 * </IABConsentDialog.Root>
 * ```
 *
 * Note: Next.js Server Components do not support compound components.
 * Ensure you add 'use client' to the file.
 *
 * @public
 */
const IABConsentDialog = Object.assign(IABConsentDialogComponent, {
	Card: IABConsentDialogCard,
	Content: IABConsentDialogContent,
	FeatureItem,
	Footer: IABConsentDialogFooter,
	Header: IABConsentDialogHeader,
	Overlay: IABConsentDialogOverlay,
	PurposeItem,
	Root: IABConsentDialogRoot,
	StackItem,
	TabButton: IABConsentDialogTabButton,
	Tabs: IABConsentDialogTabs,
	VendorList,
}) as IABConsentDialogCompoundComponent;

export default IABConsentDialog;

export { IABConsentDialogCard } from './atoms/iab-consent-dialog-card';
export { IABConsentDialogContent } from './atoms/iab-consent-dialog-content';
export { FeatureItem, type FeatureItemProps } from './atoms/feature-item';
export { IABConsentDialogFooter } from './atoms/iab-consent-dialog-footer';
export { IABConsentDialogHeader } from './atoms/iab-consent-dialog-header';
export { IABConsentDialogOverlay } from './atoms/iab-consent-dialog-overlay';
export { PurposeItem } from './atoms/purpose-item';
export { IABConsentDialogRoot } from './atoms/iab-consent-dialog-root';
export { StackItem } from './atoms/stack-item';
export {
	IABConsentDialogTabButton,
	IABConsentDialogTabs,
} from './atoms/iab-consent-dialog-tabs';
export { VendorList } from './atoms/vendor-list';
export {
	type IABDisplayModel,
	useIABDisplayModel,
} from './use-iab-display-model';
export { type GVLData, useGVLData } from './use-gvl-data';
export type {
	ProcessedPurpose,
	ProcessedSpecialFeature,
	ProcessedStack,
	ProcessedVendor,
} from './iab-consent-dialog.model';
export { IABConsentDialog, type IABConsentDialogProps };
