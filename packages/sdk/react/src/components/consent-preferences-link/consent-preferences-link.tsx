'use client';

import type { PolicyRight } from '@inth/sdk/schema/types';
import { activateOptOutLink } from '@inth/sdk/surface-actions';
import { resolveOptOutLink } from '@inth/sdk/surface-state';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';
import {
	cloneElement,
	forwardRef as createForwardRef,
	isValidElement,
} from 'react';
import type { MouseEvent, ReactElement, ReactNode, Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentButton } from '~/components/shared/primitives/button';
import type { ConsentButtonProps } from '~/components/shared/primitives/button.types';
import { OptOutIcon } from '~/components/shared/ui/opt-out-icon';
import {
	useHasConsentPreferences,
	usePolicyRule,
	useResolvedPresentation,
} from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useKernel } from '~/kernel-selector';

/**
 * Inline trigger for opening the consent dialog or exercising the opt-out
 * right from places like site footers.
 *
 * @remarks
 * Renders an unstyled button by default so site styles can define the visual
 * appearance. When `right="opt-out"` is set under an opt-out policy, the
 * action follows the resolved `presentation.optOutLink` title: `'do-not-sell'`
 * records an opt-out in one click and opens the confirmation view, while
 * `'privacy-choices'` and `'california-privacy-choices'` open the preference
 * center without recording an opt-out. Under other models it opens the
 * preference center.
 */
export interface ConsentDialogLinkProps extends Omit<
	ConsentButtonProps,
	'children'
> {
	/**
	 * Custom trigger content, for example "Your privacy settings" or "Manage
	 * preferences". When `right="opt-out"` is set and omitted, defaults to the
	 * resolved opt-out link title.
	 */
	children?: ReactNode;
	/**
	 * Persistent right this link exercises. Set to `'opt-out'` for a
	 * "Do Not Sell or Share" or "Your Privacy Choices" footer link.
	 */
	right?: Exclude<PolicyRight, 'disclosure'>;
}

export const ConsentDialogLink = createForwardRef<
	HTMLButtonElement,
	ConsentDialogLinkProps
>(({ children, noStyle = true, right, onClick, asChild, ...props }, ref) => {
	const kernel = useKernel();
	const policy = usePolicyRule();
	const hasConsentUI = useHasConsentPreferences();
	const translations = useTranslations();
	const presentation = useResolvedPresentation();
	const { noStyle: themeNoStyle } = useTheme();

	if (!hasConsentUI) {
		// Nothing to open: without a policy, or under a `none` rule with no
		// rights, the preference center renders nothing.
		return null;
	}

	const isOptOut = right === 'opt-out';
	const optOutLink = isOptOut
		? resolveOptOutLink(translations, presentation?.optOutLink)
		: null;
	const showOptOutIcon = optOutLink?.variant === 'privacy-choices';
	const defaultLabel = optOutLink
		? optOutLink.label
		: translations.consentManagerDialog.title;
	const icon = showOptOutIcon ? (
		<OptOutIcon
			className={themeNoStyle ? undefined : legalLinkStyles.optOutIcon}
			sized={!themeNoStyle}
		/>
	) : null;

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		onClick?.(event);
		if (optOutLink && !event.defaultPrevented) {
			void activateOptOutLink(kernel, optOutLink.variant);
		}
	};

	let buttonContent: ReactNode = children ?? defaultLabel;
	if (asChild && icon && isValidElement<{ children?: ReactNode }>(children)) {
		// oxlint-disable-next-line react/no-clone-element -- Injects the mandated CPPA icon into an asChild Privacy Choices element so it cannot render without it.
		buttonContent = cloneElement(
			children as ReactElement<{ children?: ReactNode }>,
			undefined,
			icon,
			children.props.children
		);
	} else if (icon) {
		buttonContent = (
			<>
				{icon}
				{children ?? defaultLabel}
			</>
		);
	}

	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action={isOptOut ? 'custom-consent' : 'open-consent-dialog'}
			asChild={asChild}
			noStyle={noStyle}
			performDefaultAction={!isOptOut}
			data-testid="consent-dialog-link"
			data-inth-rights={policy.rights.join(' ')}
			data-right={right}
			data-opt-out-variant={optOutLink?.variant}
			onClick={handleClick}
			{...props}
		>
			{buttonContent}
		</ConsentButton>
	);
});

ConsentDialogLink.displayName = 'ConsentDialogLink';
