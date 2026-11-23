'use client';

import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef } from 'react';
import type {
Ref
} from 'react';

import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';

const OptOutConfirmationFooter = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.footer}
		data-testid="opt-out-confirmation-footer"
		slotKey="opt-out-confirmation.footer"
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationFooter.displayName = 'OptOutConfirmationFooter';

export { OptOutConfirmationFooter as Footer, OptOutConfirmationFooter };
