import type { AllConsentNames } from '@inth/sdk/engine';
import { forwardRef as createForwardRef } from 'react';

import { resolveConsentGateCopy } from '~/component-hooks/use-consent-gate';
import { useTranslations } from '~/component-hooks/use-translations';
import { useUIConfig } from '~/use-ui-config';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { ConsentButton } from '../shared/primitives/consent-button';
import type { ConsentButtonProps } from '../shared/primitives/consent-button.model';

const ConsentGateButton = createForwardRef<
	HTMLButtonElement,
	Omit<ConsentButtonProps, 'slotKey'> & { category: AllConsentNames }
>(({ children, category, className, style, ...props }, ref) => {
	const translations = useTranslations();
	const { components } = useUIConfig();
	// The gate's slot goes on top of `button.primary`, which the button
	// applies itself. The button's own class and style win over both.
	const slotProps = mergeSlotProps(
		getSlotProps(components, 'consent-gate.button'),
		{ className, style }
	);

	const defaultText = resolveConsentGateCopy(
		translations,
		category
	).actionLabel;

	return (
		<ConsentButton
			mode="stroke"
			size="small"
			variant="primary"
			{...slotProps}
			{...props}
			ref={ref}
			action="open-consent-dialog"
			category={category}
			data-testid="consent-gate-button"
		>
			{children ?? defaultText}
		</ConsentButton>
	);
});

ConsentGateButton.displayName = 'ConsentGateButton';

export { ConsentGateButton };
