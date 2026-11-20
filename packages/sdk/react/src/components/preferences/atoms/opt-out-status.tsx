'use client';

import { resolveOptOutCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-manager';
import { forwardRef as createForwardRef } from 'react';
import type { Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import { useOptOutState } from '~/hooks/use-opt-out-state';

/**
 * Status line announcing an honored opt-out at the top of preferences.
 * Renders nothing when no opt-out is held.
 *
 * @public
 */
export const ConsentWidgetOptOutStatus = createForwardRef<
	HTMLParagraphElement,
	Omit<BoxProps, 'children' | 'slotKey'>
>(({ ...props }, ref) => {
	const optOutState = useOptOutState();
	const translations = useTranslations();

	if (!optOutState.honored) {
		return null;
	}

	const copy = resolveOptOutCopy(translations);
	const text =
		optOutState.via === 'signal' ? copy.statusSignal : copy.statusRequest;

	return (
		<Box
			asChild
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.optOutStatus}
			data-testid="consent-widget-opt-out-status"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Keep <p role="status"> for DOM parity with browser, Vue, Svelte and Angular.
			role="status"
			{...props}
			slotKey="manager.optOutStatus"
		>
			<p>{text}</p>
		</Box>
	);
});
ConsentWidgetOptOutStatus.displayName = 'ConsentWidgetOptOutStatus';

const OptOutStatus = ConsentWidgetOptOutStatus;

export { OptOutStatus };
