'use client';

import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef } from 'react';
import type {
Ref
} from 'react';

import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';

const OptOutConfirmationHeader = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.header}
		data-testid="opt-out-confirmation-header"
		slotKey="opt-out-confirmation.header"
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationHeader.displayName = 'OptOutConfirmationHeader';

export { OptOutConfirmationHeader as Header, OptOutConfirmationHeader };
