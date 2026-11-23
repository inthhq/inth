'use client';

import styles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import { resolveBrandMark } from '@inth/sdk/ui/utils';
import { isValidElement } from 'react';
import type { ReactNode } from 'react';

import { BrandMarkIcon } from '~/components/shared/ui/brand-mark-icon';
import { useTheme } from '~/hooks/use-theme';
import { useUIConfig } from '~/use-ui-config';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import type { TriggerIcon as TriggerIconType } from '../consent-dialog-trigger.model';
import { FingerprintIcon, SettingsIcon } from './settings-icon';
import { useTriggerContext } from './trigger-root';

export interface TriggerIconProps {
	/**
	 * Icon to display.
	 * - 'branding' - c15t or INTH logo based on branding setting
	 * - 'fingerprint' - Generic fingerprint icon
	 * - 'settings' - Generic settings/gear icon
	 * - ReactNode - Custom icon element
	 *
	 * @default 'branding'
	 */
	icon?: TriggerIconType;

	className?: string;

	/**
	 * When true, removes default styling.
	 * @default false
	 */
	noStyle?: boolean;
}

/**
 * Icon component that renders the appropriate icon based on branding.
 *
 * @example
 * ```tsx
 * // Default branding icon
 * <ConsentDialogTrigger.Icon />
 *
 * // Fingerprint icon
 * <ConsentDialogTrigger.Icon icon="fingerprint" />
 *
 * // Custom icon
 * <ConsentDialogTrigger.Icon icon={<MyCustomIcon />} />
 * ```
 */
export const TriggerIcon = ({
	icon = 'branding',
	className,
	noStyle,
}: TriggerIconProps): ReactNode => {
	const { components } = useUIConfig();
	const { noStyle: contextNoStyle } = useTheme();
	const { branding } = useTriggerContext();
	const iconProps = mergeSlotProps(components?.trigger?.icon, {
		baseClassName: styles.icon,
		className,
		noStyle: noStyle ?? contextNoStyle,
	});

	if (isValidElement(icon)) {
		return (
			<span
				{...iconProps}
				aria-hidden="true"
			>
				{icon}
			</span>
		);
	}

	let iconElement: ReactNode;
	switch (icon) {
		case 'fingerprint':
			iconElement = <FingerprintIcon />;
			break;
		case 'settings':
			iconElement = <SettingsIcon />;
			break;
		default:
			iconElement = <BrandMarkIcon mark={resolveBrandMark(branding)} />;
	}

	return (
		<span
			{...iconProps}
			aria-hidden="true"
		>
			{iconElement}
		</span>
	);
};

TriggerIcon.displayName = 'ConsentDialogTrigger.Icon';
