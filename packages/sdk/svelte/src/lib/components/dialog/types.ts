import type { LegalLinks, Model } from '@inth/sdk/engine';
import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';

/** Props for the trigger `ConsentDialog` renders when `showTrigger` is set. */
export interface ConsentDialogTriggerProps {
	defaultPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
	persistPosition?: boolean;
	showWhen?: ConsentDialogTriggerVisibility;
	size?: 'sm' | 'md' | 'lg';
	ariaLabel?: string;
	noStyle?: boolean;
	class?: string;
}

export interface ConsentDialogProps {
	/**
	 * Control whether the dialog is open. Left unset, the consent manager
	 * opens and closes it.
	 */
	open?: boolean;
	noStyle?: boolean;
	/**
	 * Skip the enter and exit animations. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	disableAnimation?: boolean;
	/**
	 * Lock page scroll behind the opt-in confirmation this dialog hosts.
	 * Defaults to the provider's `scrollLock`, else on.
	 */
	scrollLock?: boolean;
	/**
	 * Trap focus in the opt-in confirmation this dialog hosts. Defaults to
	 * the provider's `trapFocus`, else on.
	 */
	trapFocus?: boolean;
	legalLinks?: (keyof LegalLinks)[] | null;
	showTrigger?: boolean | ConsentDialogTriggerProps;
	models?: Model[];
}
