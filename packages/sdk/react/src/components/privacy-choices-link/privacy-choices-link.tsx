'use client';

import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
import { resolvePrivacyChoicesLink } from '@inth/sdk/surface-state';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import {
	createElement,
	forwardRef as createForwardRef,
	isValidElement,
} from 'react';
import type { ReactElement, ReactNode, Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentButton } from '~/components/shared/primitives/button';
import type { ConsentButtonProps } from '~/components/shared/primitives/button.types';
import { OptOutIcon } from '~/components/shared/ui/opt-out-icon';
import { useResolvedPresentation, useSnapshot } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';

/**
 * Footer link for US state opt-out regions that opens the preference center.
 *
 * Renders the title resolved from `presentation.optOutLink` (or the `variant`
 * prop override), with the California Privacy Protection Agency opt-out icon
 * beside both Privacy Choices titles and no icon beside the statutory
 * "Do Not Sell or Share My Personal Information" title. Activating the link
 * always opens the preference dialog and never records an opt-out on its own.
 *
 * It is also the way back into the dialog under an opt-in policy, in the
 * US or the EU: it reads "Your Privacy Choices" there, with no opt-out
 * icon, since no opt-out right is offered.
 *
 * Renders nothing when no policy has resolved yet, under IAB, or when an
 * external consent source owns consent.
 */
export interface PrivacyChoicesLinkProps extends Omit<
	ConsentButtonProps,
	'children' | 'variant'
> {
	/**
	 * Custom link content. Defaults to the title resolved for the configured
	 * `presentation.optOutLink` or the `variant` prop.
	 */
	children?: ReactNode;
	/**
	 * Override `presentation.optOutLink` for this link: `'privacy-choices'`,
	 * `'california-privacy-choices'`, or `'do-not-sell'`.
	 */
	variant?: OptOutLinkVariant;
}

export const PrivacyChoicesLink = createForwardRef<
	HTMLButtonElement,
	PrivacyChoicesLinkProps
>(({ children, noStyle = true, variant, asChild, ...props }, ref) => {
	const snapshot = useSnapshot();
	const translations = useTranslations();
	const presentation = useResolvedPresentation();
	const { noStyle: themeNoStyle } = useTheme();

	const optOutLink = resolvePrivacyChoicesLink(snapshot, translations, {
		variant: variant ?? presentation?.optOutLink,
	});

	if (!optOutLink) {
		return null;
	}

	const icon = optOutLink.icon ? (
		<OptOutIcon
			className={themeNoStyle ? undefined : legalLinkStyles.optOutIcon}
			sized={!themeNoStyle}
		/>
	) : null;

	let buttonContent: ReactNode = children ?? optOutLink.label;
	if (asChild && icon && isValidElement<{ children?: ReactNode }>(children)) {
		const child = children as ReactElement<{ children?: ReactNode }>;
		buttonContent = createElement(
			child.type,
			child.props,
			icon,
			child.props.children
		);
	} else if (icon) {
		buttonContent = (
			<>
				{icon}
				{children ?? optOutLink.label}
			</>
		);
	}

	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="open-consent-dialog"
			asChild={asChild}
			noStyle={noStyle}
			data-testid="privacy-choices-link"
			data-inth-rights={snapshot.policyRule.rights.join(' ')}
			data-opt-out-variant={
				optOutLink.variant === 'choices' ? undefined : optOutLink.variant
			}
			{...props}
		>
			{buttonContent}
		</ConsentButton>
	);
});

PrivacyChoicesLink.displayName = 'PrivacyChoicesLink';
