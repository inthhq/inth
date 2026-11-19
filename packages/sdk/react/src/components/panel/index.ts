'use client';

import type { FC } from 'react';

import {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
} from './atoms/card';
import { Overlay } from './atoms/overlay';
import { Root } from './atoms/root';
import { ConsentDialog as ConsentDialogComponent } from './panel';
import type { ConsentDialogProps } from './panel';

export type { ConsentDialogProps };

export interface ConsentDialogCompoundComponent extends FC<ConsentDialogProps> {
	Card: typeof Card;
	Header: typeof Header;
	HeaderTitle: typeof HeaderTitle;
	HeaderDescription: typeof HeaderDescription;
	Content: typeof Content;
	Footer: typeof Footer;
	ConsentCustomizationCard: typeof ConsentCustomizationCard;
	ConsentDialogFooter: typeof ConsentDialogFooter;
	ConsentDialogHeader: typeof ConsentDialogHeader;
	ConsentDialogHeaderTitle: typeof ConsentDialogHeaderTitle;
	ConsentDialogHeaderDescription: typeof ConsentDialogHeaderDescription;
	ConsentDialogContent: typeof ConsentDialogContent;
	Overlay: typeof Overlay;
	Root: typeof Root;
}

/**
 * A modal dialog component for detailed privacy consent management.
 *
 * @remarks
 * Renders into `document.body` through a portal, after hydration.
 *
 * @example
 * Basic usage:
 * ```tsx
 * <ConsentDialog />
 * ```
 *
 * @example
 * Preferred customization with stock structure:
 * ```tsx
 * <ConsentProvider
 *   options={{
 *     mode: hosted({ projectUrl: '/api/inth' }),
 *     components: {
 *       dialog: {
 *         card: { className: 'rounded-3xl shadow-xl' },
 *       },
 *       manager: {
 *         footer: { className: 'gap-3 pt-6' },
 *       },
 *       tag: {
 *         dialog: { className: 'shadow-none' },
 *       },
 *     },
 *   }}
 * >
 *   <ConsentDialog hideBranding showTrigger />
 * </ConsentProvider>
 * ```
 *
 * @example
 * Advanced custom markup with compound components:
 * ```tsx
 * <ConsentDialog.Root>
 *   <ConsentDialog.Card>
 *     <ConsentDialog.Header>
 *       <ConsentDialog.HeaderTitle />
 *       <ConsentDialog.HeaderDescription />
 *     </ConsentDialog.Header>
 *     <ConsentDialog.Content>
 *       <ConsentWidget />
 *     </ConsentDialog.Content>
 *     <ConsentDialog.Footer />
 *   </ConsentDialog.Card>
 * </ConsentDialog.Root>
 * ```
 *
 * Note: Next.js Server Components do not support compound components. Ensure you add `'use client'` to the file.
 *
 * @public
 */
const ConsentDialog = Object.assign(ConsentDialogComponent, {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
	Overlay,
	Root,
}) as ConsentDialogCompoundComponent;

export default ConsentDialog;

// Export individual components for backward compatibility
export {
	Card,
	ConsentCustomizationCard,
	ConsentDialogContent,
	ConsentDialogFooter,
	ConsentDialogHeader,
	ConsentDialogHeaderDescription,
	ConsentDialogHeaderTitle,
	Content,
	Footer,
	Header,
	HeaderDescription,
	HeaderTitle,
} from './atoms/card';
export { ConsentDialogOverlay, Overlay } from './atoms/overlay';
export { ConsentDialogRoot, Root } from './atoms/root';
export { ConsentDialog };
