'use client';

import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef } from 'react';
import type {
Ref
} from 'react';

import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';

const OptOutConfirmationCard = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.card}
		data-testid="opt-out-confirmation-card"
		slotKey="opt-out-confirmation.card"
		tabIndex={-1}
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationCard.displayName = 'OptOutConfirmationCard';

export { OptOutConfirmationCard as Card, OptOutConfirmationCard };
