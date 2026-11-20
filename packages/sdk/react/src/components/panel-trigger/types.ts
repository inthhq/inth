import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
import type { CornerPosition } from '@inth/sdk/ui/utils/trigger-utils';
import type { ReactNode } from 'react';

import type { ClassNameStyle } from '~/types/theme';

/**
 * Icon rendered by a consent dialog trigger control.
 *
 * - `'branding'` - Shows c15t or INTH logo based on branding setting
 * - `'fingerprint'` - Generic fingerprint/privacy icon
 * - `'settings'` - Generic settings/gear icon
 * - `ReactNode` - Custom icon element
 */
export type TriggerIcon = 'branding' | 'fingerprint' | 'settings' | ReactNode;

export type TriggerSize = 'sm' | 'md' | 'lg';

/**
 * Layout direction for the consent dialog trigger toolbar.
 */
export type TriggerOrientation = 'horizontal' | 'vertical';

/**
 * Props for the single-button ConsentDialogTrigger component.
 */
export interface ConsentDialogTriggerProps {
	/**
	 * Icon to display in the trigger button.
	 *
	 * @default 'branding'
	 */
	icon?: TriggerIcon;

	/**
	 * Default corner position for the trigger.
	 * User can drag to any corner and the position will be remembered.
	 *
	 * @default 'bottom-right'
	 */
	defaultPosition?: CornerPosition;

	/**
	 * Whether to persist the user's position preference in localStorage.
	 *
	 * @default true
	 */
	persistPosition?: boolean;

	/**
	 * Accessible label for the trigger button. Defaults to the
	 * `trigger.label` translation ("Open privacy settings").
	 */
	ariaLabel?: string;

	className?: string;

	/**
	 * When true, removes default styling.
	 *
	 * @default false
	 */
	noStyle?: boolean;

	/**
	 * Controls when the trigger is visible.
	 *
	 * @default 'always'
	 */
	showWhen?: ConsentDialogTriggerVisibility;

	/**
	 * Size of the trigger button.
	 *
	 * @default 'md'
	 */
	size?: TriggerSize;

	/**
	 * Callback fired when the trigger is clicked, before opening the dialog.
	 */
	onClick?: () => void;

	/**
	 * Callback fired when the corner position changes.
	 */
	onPositionChange?: (position: CornerPosition) => void;
}

/**
 * A custom action displayed in ConsentDialogTriggerToolbar.
 */
export interface ConsentDialogTriggerToolbarAction {
	/** Stable key for the action. */
	id: string;

	/** Accessible name announced for the action button. */
	label: string;

	icon: TriggerIcon;

	onSelect: () => void;

	disabled?: boolean;

	/** Whether the action represents a currently active toggle state. */
	pressed?: boolean;

	className?: string;

	style?: ClassNameStyle['style'];
}

/**
 * Customization for the toolbar's built-in privacy preferences action.
 */
export interface ConsentDialogTriggerToolbarPreferences {
	/**
	 * Accessible name announced for the preferences button.
	 *
	 * Defaults to the active rule's rights: the translated opt-out label
	 * ("Do Not Sell or Share My Personal Information") when the rule
	 * carries the `opt-out` right, otherwise the translated preferences
	 * label ("Manage preferences").
	 */
	label?: string;

	/**
	 * Icon displayed in the preferences button.
	 *
	 * @default 'branding'
	 */
	icon?: TriggerIcon;

	/** Callback fired before the preferences dialog opens. */
	onSelect?: () => void;

	className?: string;

	style?: ClassNameStyle['style'];
}

/**
 * Props for the standalone ConsentDialogTriggerToolbar component.
 */
export interface ConsentDialogTriggerToolbarProps extends Omit<
	ClassNameStyle,
	'baseClassName'
> {
	/**
	 * App-owned actions rendered alongside the built-in preferences action.
	 *
	 * @default []
	 */
	actions?: readonly ConsentDialogTriggerToolbarAction[];

	/**
	 * Customization for the built-in preferences action. The toolbar renders
	 * at most one preferences action; `showWhen` decides whether it is shown.
	 */
	preferences?: ConsentDialogTriggerToolbarPreferences;

	/**
	 * Layout direction for the toolbar.
	 *
	 * @default 'horizontal'
	 */
	orientation?: TriggerOrientation;

	/**
	 * Default corner position for the toolbar.
	 *
	 * @default 'bottom-right'
	 */
	defaultPosition?: CornerPosition;

	/**
	 * Whether to persist the user's position preference in localStorage.
	 *
	 * @default true
	 */
	persistPosition?: boolean;

	/**
	 * Accessible label for the toolbar. Defaults to the
	 * `trigger.toolbarLabel` translation ("Privacy controls").
	 */
	ariaLabel?: string;

	/**
	 * Controls when the built-in preferences action is visible. App-owned
	 * `actions` always render, so a theme toggle stays available while a
	 * prompt is owed; `after-consent` hides only the preferences action until
	 * the visitor has answered, and `never` omits it. The toolbar renders
	 * nothing only when it has no visible item.
	 *
	 * @default 'always'
	 */
	showWhen?: ConsentDialogTriggerVisibility;

	/**
	 * Size of each toolbar action.
	 *
	 * @default 'md'
	 */
	size?: TriggerSize;

	/**
	 * Callback fired when the corner position changes.
	 */
	onPositionChange?: (position: CornerPosition) => void;
}

export type { CornerPosition };
