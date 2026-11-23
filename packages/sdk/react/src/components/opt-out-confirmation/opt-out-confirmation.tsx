'use client';

import type { FC, ReactNode } from 'react';

import { useComponentConfig } from '~/hooks/use-component-config';

import { OptOutConfirmationCard } from './atoms/opt-out-confirmation-card';
import { OptOutConfirmationDescription } from './atoms/opt-out-confirmation-description';
import { OptOutConfirmationDetails } from './atoms/opt-out-confirmation-details';
import { OptOutConfirmationDoneButton } from './atoms/opt-out-confirmation-done-button';
import { OptOutConfirmationFooter } from './atoms/opt-out-confirmation-footer';
import { OptOutConfirmationHeader } from './atoms/opt-out-confirmation-header';
import { OptOutConfirmationPreferencesLink } from './atoms/opt-out-confirmation-preferences-link';
import { OptOutConfirmationStatus } from './atoms/opt-out-confirmation-status';
import { OptOutConfirmationTitle } from './atoms/opt-out-confirmation-title';
import { OptOutConfirmationRoot } from './atoms/root';

/**
 * Props for {@link OptOutConfirmation}.
 *
 * @public
 */
export interface OptOutConfirmationProps {
	/** Control the open state. Defaults to the opt-out confirmation state. */
	open?: boolean;
	/** Called when the confirmation view closes (Done or Escape). */
	onClose?: () => void;
	/** Disables all animations when true. */
	disableAnimation?: boolean;
	/** Removes default styles when true. */
	noStyle?: boolean;
	/** Locks page scroll while open. Defaults to `true`. */
	scrollLock?: boolean;
	/** Traps keyboard focus while open. Defaults to `true`. */
	trapFocus?: boolean;
	/** Custom backdrop element, or `false` to render none. */
	overlay?: ReactNode | false;
	/**
	 * Marks an embedded host inside `ConsentDialog`.
	 *
	 * @internal
	 */
	embedded?: boolean;
}

export const OptOutConfirmation: FC<OptOutConfirmationProps> = ({
	open,
	onClose,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock,
	trapFocus,
	overlay,
	embedded,
}) => {
	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
	});

	return (
		<OptOutConfirmationRoot
			open={open}
			onClose={onClose}
			{...config}
			scrollLock={scrollLock}
			trapFocus={trapFocus}
			overlay={overlay}
			embedded={embedded}
		>
			<OptOutConfirmationCard>
				<OptOutConfirmationHeader>
					<OptOutConfirmationTitle />
				</OptOutConfirmationHeader>
				<OptOutConfirmationStatus />
				<OptOutConfirmationDescription />
				<OptOutConfirmationDetails />
				<OptOutConfirmationFooter>
					<OptOutConfirmationDoneButton />
					<OptOutConfirmationPreferencesLink />
				</OptOutConfirmationFooter>
			</OptOutConfirmationCard>
		</OptOutConfirmationRoot>
	);
};
