'use client';

import { optInConsentSurface } from '@inth/sdk/surface-actions';
import {
	resolveOptOutBlockHeading,
	resolveOptOutCopy,
} from '@inth/sdk/surface-state';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import styles from '@inth/sdk/ui/styles/components/consent-manager';
import { forwardRef as createForwardRef, useId } from 'react';
import type { Ref } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import {
	OptOutConfirmationDescription,
	OptOutConfirmationDetails,
} from '~/components/opt-out-confirmation/atoms/parts';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import {
	toSaveUISource,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import {
	useOptOut,
	useOptOutReceipt,
	useOptOutState,
	useResolvedPresentation,
} from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { ConsentWidgetOptOutStatus } from './opt-out-status';

/**
 * Direct sale-and-sharing opt-out block rendered at the top of preferences
 * under an opt-out policy.
 *
 * California rules state: "A notification or tool regarding cookies, such as a
 * cookie banner or cookie controls, is not by itself an acceptable method for
 * submitting requests to opt-out of sale/sharing ... An acceptable method for
 * submitting requests to opt-out of sale/sharing must address the sale and
 * sharing of personal information." (11 CCR §7026(a)(4)).
 *
 * Under any non-opt-out policy, falls back to the standalone status line so
 * existing layouts stay unchanged.
 *
 * @public
 */
export const ConsentWidgetOptOut = createForwardRef<
	HTMLElement,
	Omit<BoxProps, 'children' | 'slotKey'>
>(({ noStyle, ...props }, ref) => {
	const optOutState = useOptOutState();
	const receipt = useOptOutReceipt();
	const translations = useTranslations();
	const presentation = useResolvedPresentation();
	const optOut = useOptOut();
	const kernel = useKernel();
	const { uiSource } = useConsentTracking();
	const { noStyle: contextNoStyle } = useTheme();
	const { components } = useUIConfig();
	const headingId = useId();

	if (!optOutState.available) {
		return <ConsentWidgetOptOutStatus noStyle={noStyle} />;
	}

	const finalNoStyle = Boolean(noStyle ?? contextNoStyle);
	const copy = resolveOptOutCopy(translations);
	const heading = resolveOptOutBlockHeading(
		translations,
		receipt,
		presentation?.optOutLink
	);
	const buttonProps = mergeSlotProps(
		getSlotProps(components, 'button.primary'),
		{
			baseClassName: buttonStyles.button,
			noStyle: finalNoStyle,
		}
	);

	return (
		<Box
			asChild
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.optOut}
			data-testid="consent-widget-opt-out"
			noStyle={noStyle}
			{...props}
			slotKey="manager.optOut"
		>
			<section aria-labelledby={headingId}>
				<h3
					id={headingId}
					className={finalNoStyle ? undefined : styles.optOutHeading}
					data-testid="consent-widget-opt-out-heading"
				>
					{heading}
				</h3>
				{optOutState.honored ? (
					<>
						<ConsentWidgetOptOutStatus noStyle={noStyle} />
						<OptOutConfirmationDescription
							id={undefined}
							data-testid="consent-widget-opt-out-description"
							noStyle={noStyle}
							slotKey={undefined}
						/>
						<OptOutConfirmationDetails
							data-testid="consent-widget-opt-out-receipt"
							noStyle={noStyle}
							recordedAtTestId="consent-widget-opt-out-recorded-at"
							referenceTestId="consent-widget-opt-out-reference"
						/>
						{optOutState.lock !== 'gpc-active' && (
							<button
								type="button"
								className={finalNoStyle ? undefined : styles.optInLink}
								data-testid="consent-widget-opt-in-link"
								onClick={() => {
									optInConsentSurface(kernel, {
										uiSource: toSaveUISource(uiSource),
									});
								}}
							>
								{copy.optInLink}
							</button>
						)}
					</>
				) : (
					<>
						<p
							className={finalNoStyle ? undefined : styles.optOutDescription}
							data-testid="consent-widget-opt-out-description"
						>
							{copy.notOptedOut}
						</p>
						<div className={finalNoStyle ? undefined : styles.optOutActions}>
							<button
								type="button"
								data-mode={finalNoStyle ? undefined : 'filled'}
								data-size={finalNoStyle ? undefined : 'small'}
								data-variant={finalNoStyle ? undefined : 'primary'}
								{...buttonProps}
								data-testid="consent-widget-opt-out-button"
								onClick={() => {
									void optOut({ uiSource: toSaveUISource(uiSource) });
								}}
							>
								{copy.action}
							</button>
						</div>
					</>
				)}
			</section>
		</Box>
	);
});
ConsentWidgetOptOut.displayName = 'ConsentWidgetOptOut';

const OptOut = ConsentWidgetOptOut;

export { OptOut };
