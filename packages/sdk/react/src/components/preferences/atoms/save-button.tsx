import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useConsentLabels } from '~/component-hooks/use-consent-labels';
import { ConsentButton } from '~/components/shared/primitives/consent-button';
import type { ConsentButtonProps } from '~/components/shared/primitives/consent-button.model';

const ConsentWidgetSaveButton = createForwardRef<
	HTMLButtonElement,
	ConsentButtonProps
>(({ children, ...props }, ref) => {
	const labels = useConsentLabels();
	return (
		<ConsentButton
			ref={ref as Ref<HTMLButtonElement>}
			action="custom-consent"
			consentAction="save"
			closeConsentDialog
			{...props}
			slotKey="button.primary"
			data-testid="consent-widget-footer-save-button"
		>
			{children ?? labels.actions.save}
		</ConsentButton>
	);
});
ConsentWidgetSaveButton.displayName = 'ConsentWidgetSaveButton';

const SaveButton = ConsentWidgetSaveButton;

export { SaveButton, ConsentWidgetSaveButton };
