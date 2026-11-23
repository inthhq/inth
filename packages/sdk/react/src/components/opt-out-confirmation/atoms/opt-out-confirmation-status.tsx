'use client';

import {
resolveOptOutCopy
} from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef,isValidElement } from 'react';
import type {
Ref
} from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import {
useOptOutState
} from '~/hooks';

const OptOutConfirmationStatus = createForwardRef<
	HTMLParagraphElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const optOutCopy = resolveOptOutCopy(translations);
	const optOutState = useOptOutState();
	const statusText =
		optOutState.via === 'signal'
			? optOutCopy.statusSignal
			: optOutCopy.statusRequest;
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.status}
			data-testid="opt-out-confirmation-status"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Matches the shared p[role="status"] opt-out confirmation contract.
			role="status"
			slotKey="opt-out-confirmation.status"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<p>{children ?? statusText}</p>
			)}
		</Box>
	);
});
OptOutConfirmationStatus.displayName = 'OptOutConfirmationStatus';

export { OptOutConfirmationStatus as Status, OptOutConfirmationStatus };
