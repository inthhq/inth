'use client';

import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
import { resolveOptOutLink, resolveOptOutState } from '@inth/sdk/surface-state';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
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
 * Renders nothing when the active policy gives no opt-out right, when no
 * policy has resolved yet, or when an external consent source owns consent.
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

	const hasOptOutRight =
		snapshot.resolution.status === 'matched' &&
		!snapshot.externalPermissions &&
		resolveOptOutState(snapshot).available &&
		snapshot.policyRule.rights.includes('opt-out');

	if (!hasOptOutRight) {
		return null;
	}

	const optOutLink = resolveOptOutLink(
		translations,
		variant ?? presentation?.optOutLink
	);
	const showOptOutIcon = optOutLink.variant === 'privacy-choices';
	const icon = showOptOutIcon ? (
		<OptOutIcon
			className={themeNoStyle ? undefined : bannerStyles.optOutIcon}
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
			data-opt-out-variant={optOutLink.variant}
			{...props}
		>
			{buttonContent}
		</ConsentButton>
	);
});

PrivacyChoicesLink.displayName = 'PrivacyChoicesLink';
