'use client';

import type { FC } from 'react';

import { FeatureItem } from './atoms/feature-item';
import { IABConsentDialogCard } from './atoms/iab-panel-card';
import { IABConsentDialogContent } from './atoms/iab-panel-content';
import { IABConsentDialogFooter } from './atoms/iab-panel-footer';
import { IABConsentDialogHeader } from './atoms/iab-panel-header';
import { IABConsentDialogOverlay } from './atoms/iab-panel-overlay';
import { IABConsentDialogRoot } from './atoms/iab-panel-root';
import {
	IABConsentDialogTabButton,
	IABConsentDialogTabs,
} from './atoms/iab-panel-tabs';
import { PurposeItem } from './atoms/purpose-item';
import { StackItem } from './atoms/stack-item';
import { VendorList } from './atoms/vendor-list';
import { IABConsentDialog as IABConsentDialogComponent } from './iab-panel';
import type { IABConsentDialogProps } from './iab-panel';

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

export { IABConsentDialogCard } from './atoms/iab-panel-card';
export { IABConsentDialogContent } from './atoms/iab-panel-content';
export { FeatureItem, type FeatureItemProps } from './atoms/feature-item';
export { IABConsentDialogFooter } from './atoms/iab-panel-footer';
export { IABConsentDialogHeader } from './atoms/iab-panel-header';
export { IABConsentDialogOverlay } from './atoms/iab-panel-overlay';
export { PurposeItem } from './atoms/purpose-item';
export { IABConsentDialogRoot } from './atoms/iab-panel-root';
export { StackItem } from './atoms/stack-item';
export {
	IABConsentDialogTabButton,
	IABConsentDialogTabs,
} from './atoms/iab-panel-tabs';
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
} from './iab-panel.model';
export { IABConsentDialog, type IABConsentDialogProps };
