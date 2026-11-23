import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useConsentLabels } from '~/component-hooks/use-consent-labels';
import { ConsentButton } from '~/components/shared/primitives/consent-button';
import type { ConsentButtonProps } from '~/components/shared/primitives/consent-button.model';

/**
 * Button to reject all non-essential cookies.
 *
 * @remarks
 * - Sets all optional consents to false
 * - Maintains required consents
 * - Closes dialog after action
 */
const ConsentWidgetRejectButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			size="small"
			action="reject-consent"
			consentAction="reject"
			{...props}
			slotKey="button.secondary"
			data-testid="consent-widget-reject-button"
			closeConsentBanner={true}
			closeConsentDialog={true}
		>
			{children ?? labels.actions.reject}
		</ConsentButton>
	);
});
ConsentWidgetRejectButton.displayName = 'ConsentWidgetRejectButton';

const RejectButton = ConsentWidgetRejectButton;

export { RejectButton, ConsentWidgetRejectButton };
