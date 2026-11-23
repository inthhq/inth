import type * as CoreTypes from '@inth/sdk/engine';

import type { ConsentDialogTriggerProps } from '~/components/panel-trigger';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';

/**
 * Props for `<ConsentDialog />`, the consent dialog ("Your Privacy
 * Choices").
 *
 * @public
 */
export interface ConsentDialogProps {
	/**
	 * Disables all animations when true.
	 */
	disableAnimation?: boolean;

	/**
	 * Removes default styles when true.
	 */
	noStyle?: boolean;

	/**
	 * Locks scrolling while the opt-out or opt-in confirmation this dialog
	 * hosts is open. The dialog itself always blocks the page.
	 */
	scrollLock?: boolean;

	/**
	 * Traps focus in the opt-out or opt-in confirmation this dialog hosts.
	 * The dialog itself always traps focus.
	 */
	trapFocus?: boolean;

	/**
	 * Control the open state. `true` asks the consent manager to show the
	 * dialog; Close and Escape then close it through the consent manager,
	 * and `open` must turn `false` and back to `true` to ask again. `false`
	 * hides it whatever the consent manager shows. Omitted, it follows
	 * `useActiveUI() === 'dialog'`.
	 */
	open?: boolean;

	/**
	 * Which legal link the footer may show: the Cookie Policy for the EU,
	 * the Privacy Policy for the US.
	 *
	 * - `undefined` (default): shows it
	 * - `null`: hides it
	 * - an array of keys: shows it only when its key is in the list
	 *
	 * @remarks
	 * You must set the legal links in the InthProvider options.
	 */
	legalLinks?: InlineLegalLinksProps['links'];

	/**
	 * Show a floating trigger button that reopens the dialog.
	 *
	 * - `true` - Show trigger with default settings
	 * - `false` - Hide trigger (default)
	 * - `ConsentDialogTriggerProps` - Show trigger with custom props
	 *
	 * @default false
	 */
	showTrigger?: boolean | ConsentDialogTriggerProps;

	/**
	 * Which consent models this dialog responds to.
	 * @default ['opt-in', 'opt-out', 'none']
	 */
	models?: CoreTypes.Model[];

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'dialog'
	 */
	uiSource?: string;
}
