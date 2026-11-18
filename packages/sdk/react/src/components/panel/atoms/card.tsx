'use client';

import brandingStyles from '@inth/sdk/ui/styles/components/branding';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type { ReactNode, Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentWidget } from '~/components/preferences/preferences';
import { Slot } from '~/components/shared/libs/slot';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { InlineLegalLinks } from '~/components/shared/primitives/legal-links';
import { BrandingTag } from '~/components/shared/ui/branding';
import { useTheme } from '~/hooks/use-theme';
import type { ClassNameStyle } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { mergeSlotProps } from '~/utils/merge-slot-props';

/**
 * Props for the ConsentDialogCard and related components
 * @public
 */
type ConsentDialogCardProps = {
	children?: ReactNode;
} & ClassNameStyle;

const ConsentDialogCard = createForwardRef<
	HTMLDivElement,
	ConsentDialogCardProps
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.card}
		{...props}
		slotKey="dialog.card"
		data-testid="consent-dialog-card"
		tabIndex={-1}
	>
		{children}
	</Box>
));
ConsentDialogCard.displayName = 'ConsentDialogCard';

/**
 * The header section of the consent dialog.
 * Should contain the ConsentDialogHeaderTitle and optionally ConsentDialogHeaderDescription.
 *
 * @remarks
 * - Should be the first child of ConsentDialogCard
 */
const ConsentDialogHeader = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.header}
		{...props}
		slotKey="dialog.header"
		data-testid="consent-dialog-header"
	>
		{children}
	</Box>
));
ConsentDialogHeader.displayName = 'ConsentDialogHeader';

/**
 * The title component for the consent dialog header.
 * Displays the main heading of the consent management interface.
 *
 * @remarks
 * - Should be used within ConsentDialogHeader
 * - Renders an `h2`; with `asChild` the child element takes its place
 */
const ConsentDialogHeaderTitle = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const { consentManagerDialog: consentDialog } = useTranslations();
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			slotKey="dialog.title"
			{...props}
			id="consent-dialog-title"
			data-testid="consent-dialog-title"
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<h2>{children ?? consentDialog.title}</h2>
			)}
		</Box>
	);
});
ConsentDialogHeaderTitle.displayName = 'ConsentDialogHeaderTitle';

/**
 * The description component for the consent dialog header.
 * Provides additional context about privacy settings and consent choices.
 *
 * @remarks
 * - Should be used after ConsentDialogHeaderTitle
 * - Can include legal links inline with the description
 */
const ConsentDialogHeaderDescription = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'> & {
		legalLinks?: InlineLegalLinksProps['links'];
	}
>(
	(
		{ children, legalLinks, asChild, className, style, noStyle, ...props },
		ref
	) => {
		const { consentManagerDialog: consentDialog } = useTranslations();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const context = 'dialog';
		const descriptionProps = mergeSlotProps(
			components?.description?.[context],
			{
				baseClassName: styles.description,
				className,
				'data-context': context,
				'data-testid': 'consent-dialog-description',
				id: 'consent-dialog-description',
				noStyle: noStyle ?? contextNoStyle,
				style,
				...props,
			}
		);

		if (asChild && isValidElement(children)) {
			return (
				<Slot
					ref={ref as Ref<HTMLDivElement>}
					{...descriptionProps}
				>
					{children}
				</Slot>
			);
		}
		return (
			<div
				ref={ref as Ref<HTMLDivElement>}
				{...descriptionProps}
			>
				{children ?? consentDialog.description}
				<InlineLegalLinks
					links={legalLinks}
					context="dialog"
					testIdPrefix="consent-dialog-legal-link"
				/>
			</div>
		);
	}
);
ConsentDialogHeaderDescription.displayName = 'ConsentDialogHeaderDescription';

/**
 * The main content area of the consent dialog.
 * Contains the consent management interface and privacy controls.
 *
 * @remarks
 * - Typically contains ConsentWidget
 */
const ConsentDialogContent = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.content}
		slotKey="dialog.content"
		data-testid="consent-dialog-content"
		{...props}
	>
		{children}
	</Box>
));
ConsentDialogContent.displayName = 'ConsentDialogContent';

/**
 * The footer section of the consent dialog.
 * This contains the branding but can be overridden with a custom footer.
 */
const ConsentDialogFooter = createForwardRef<
	HTMLDivElement,
	BoxProps & { hideBranding?: boolean; 'data-testid'?: string }
>(({ children, hideBranding, 'data-testid': testId, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={cn(
			styles.footer,
			(children === null || children === undefined) &&
				!hideBranding &&
				brandingStyles.brandingFooter
		)}
		data-testid={testId ?? 'consent-dialog-footer'}
		{...props}
		slotKey="manager.footer"
	>
		{children ?? (
			<BrandingTag
				surface="dialog"
				hideBranding={hideBranding}
			/>
		)}
	</Box>
));
ConsentDialogFooter.displayName = 'ConsentDialogFooter';

/**
 * A pre-configured privacy settings card.
 * Combines all consent dialog components with default content for privacy customization.
 *
 * @example
 * ```tsx
 * <ConsentCustomizationCard
 *   noStyle={false}
 *   legalLinks={['privacyPolicy']}
 *   hideBranding={false}
 * />
 * ```
 */
const ConsentCustomizationCard = ({
	noStyle,
	legalLinks,
	hideBranding,
}: {
	noStyle?: boolean;
	legalLinks?: InlineLegalLinksProps['links'];
	hideBranding?: boolean;
}) => (
	<ConsentDialogCard>
		<ConsentDialogHeader>
			<ConsentDialogHeaderTitle />
			<ConsentDialogHeaderDescription legalLinks={legalLinks} />
		</ConsentDialogHeader>
		<ConsentDialogContent>
			<ConsentWidget
				hideBranding
				noStyle={noStyle}
				useProvider={true}
			/>
		</ConsentDialogContent>
		<BrandingTag
			surface="dialog"
			hideBranding={hideBranding}
		/>
	</ConsentDialogCard>
);

const Card = ConsentDialogCard;
const Header = ConsentDialogHeader;
const HeaderTitle = ConsentDialogHeaderTitle;
const HeaderDescription = ConsentDialogHeaderDescription;
const Content = ConsentDialogContent;
const Footer = ConsentDialogFooter;

export {
	Card,
	ConsentCustomizationCard,
	ConsentDialogCard,
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
};
