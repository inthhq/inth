import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useConsentLabels } from '~/component-hooks/use-consent-labels';
import { ConsentButton } from '~/components/shared/primitives/consent-button';
import type { ConsentButtonProps } from '~/components/shared/primitives/consent-button.model';

/**
 * Button to accept all available cookies.
 *
 * @remarks
 * - Enables all consent options
 * - Closes dialog after action
 * - Triggers necessary callbacks
 */
const ConsentWidgetAcceptAllButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			size="small"
			action="accept-consent"
			consentAction="accept"
			{...props}
			slotKey="button.secondary"
			data-testid="consent-widget-footer-accept-all-button"
			closeConsentBanner={true}
			closeConsentDialog={true}
		>
			{children ?? labels.actions.accept}
		</ConsentButton>
	);
});
ConsentWidgetAcceptAllButton.displayName = 'ConsentWidgetAcceptAllButton';

const AcceptAllButton = ConsentWidgetAcceptAllButton;

export { AcceptAllButton, ConsentWidgetAcceptAllButton };
