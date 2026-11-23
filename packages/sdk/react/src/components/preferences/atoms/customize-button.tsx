import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useConsentLabels } from '~/component-hooks/use-consent-labels';
import { ConsentButton } from '~/components/shared/primitives/consent-button';
import type { ConsentButtonProps } from '~/components/shared/primitives/consent-button.model';

const ConsentWidgetCustomizeButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="open-consent-dialog"
			consentAction="customize"
			{...props}
			slotKey="button.secondary"
			data-testid="consent-widget-footer-customize-button"
		>
			{children ?? labels.actions.customize}
		</ConsentButton>
	);
});
ConsentWidgetCustomizeButton.displayName = 'ConsentWidgetCustomizeButton';

const CustomizeButton = ConsentWidgetCustomizeButton;

export { CustomizeButton, ConsentWidgetCustomizeButton };
