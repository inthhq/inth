'use client';

import { resolveOptOutReceiptSentence } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type { Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import { useOptOutState } from '~/hooks';

const OptOutConfirmationDescription = createForwardRef<
	HTMLParagraphElement,
	BoxProps
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const receipt = useOptOutState();
	const sentence = resolveOptOutReceiptSentence(translations, receipt);
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.description}
			data-testid="opt-out-confirmation-description"
			id="opt-out-confirmation-description"
			slotKey="opt-out-confirmation.description"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<p>{children ?? sentence}</p>
			)}
		</Box>
	);
});
OptOutConfirmationDescription.displayName = 'OptOutConfirmationDescription';

export {
	OptOutConfirmationDescription as Description,
	OptOutConfirmationDescription,
};
