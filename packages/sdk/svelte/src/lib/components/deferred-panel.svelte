<script
	lang="ts"
	module
>
	import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';

	import type DialogComponent from './dialog/dialog.svelte';
	import type ConsentDialogTriggerComponent from './panel-trigger.svelte';

	let pending: Promise<typeof DialogComponent> | null = null;
	let pendingTrigger: Promise<typeof ConsentDialogTriggerComponent> | null =
		null;

	/**
	 * The "Your Privacy Choices" dialog, in a chunk of its own with its
	 * stylesheet. One import shared by every `ConsentDialog` on the page. A
	 * failed import is forgotten, so the next hover, focus or open retries
	 * it.
	 */
	const loadDialog = function loadDialog(): Promise<typeof DialogComponent> {
		pending ??= (async () => {
			try {
				return (await import('./dialog/dialog.svelte')).default;
			} catch (error) {
				pending = null;
				throw error;
			}
		})();
		return pending;
	};

	/**
	 * The floating trigger `ConsentDialog` renders for `showTrigger`, in a
	 * chunk of its own.
	 */
	const loadTrigger = function loadTrigger(): Promise<
		typeof ConsentDialogTriggerComponent
	> {
		pendingTrigger ??= (async () => {
			try {
				return (await import('./panel-trigger.svelte')).default;
			} catch (error) {
				pendingTrigger = null;
				throw error;
			}
		})();
		return pendingTrigger;
	};
</script>

<script lang="ts">
	/**
	 * `ConsentDialog`: the preference dialog, loaded on first use.
	 *
	 * The dialog and the preference widget inside it stay out of the first
	 * load. They load when the dialog opens, or earlier: in idle time after
	 * the page loads while a button that opens it is mounted, and on hover or
	 * focus of that button (see `preloadDialog`). Props are the dialog's own.
	 */
	import type { ActiveUI } from '@inth/sdk/engine';
	import { showConsentSurface } from '@inth/sdk/surface-actions';
	import { onMount, untrack } from 'svelte';

	import { getConsentContext, getThemeContext } from '../get-consent-context.svelte';
	import {
		holdIdleDialogWarming,
		registerDialogWarmer,
	} from '../warm-dialog';
	import { useOptOutConfirmationState } from './confirmation/use-opt-out-confirmation-state.svelte';
	import DeferredOptInConfirmation from './confirmation/deferred-opt-in-confirmation.svelte';
	import DeferredOptOutConfirmation from './confirmation/deferred-opt-out-confirmation.svelte';
	import type {
		ConsentDialogProps,
		ConsentDialogTriggerProps,
	} from './dialog/consent-dialog-props.model';
	import { requestReceiptFocus } from './parts/receipt-focus.model';

	const props: ConsentDialogProps = $props();

	const consent = getConsentContext();
	let Dialog = $state<typeof DialogComponent | null>(null);

	// The surface the dialog replaced when it opened, and the element that
	// had focus then: the Customize button or link the visitor pressed. The
	// banner and the trigger unmount while the dialog is open, and the
	// dialog's own code may still be loading, so the dialog cannot read the
	// opener later; and the shared focus trap's record of the last focused
	// element starts with that code, after the opener was focused. Read
	// before the DOM changes for the open, while the opener is still there.
	let surfaceBeforeDialog: ActiveUI = 'none';
	let opener: HTMLElement | null = null;
	$effect.pre(() => {
		const ui = consent.state.activeUI;
		if (ui !== 'dialog') {
			surfaceBeforeDialog = ui;
			return;
		}
		const active = document.activeElement;
		opener =
			active instanceof HTMLElement && active !== document.body ? active : null;
	});

	// Once the dialog has closed and the surface it replaced is back, focus
	// left on the page body returns to the opener, or to the element that
	// replaced it. Focus the dialog's own trap or the visitor already placed
	// elsewhere stays.
	$effect(() => {
		if (consent.state.activeUI === 'dialog' || !opener) {
			return;
		}
		const previous = opener;
		opener = null;
		// After the trap's own restore, which runs in a task of its own.
		const timer = setTimeout(() => {
			const active = document.activeElement;
			if (
				active &&
				active !== document.body &&
				active !== document.documentElement
			) {
				return;
			}
			findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
		}, 0);
		return () => clearTimeout(timer);
	});

	// A controlled `open` goes through the consent manager, so the session,
	// sheets and Escape follow the dialog and the banner hands over to it.
	// It asks once each time `open` turns true; Close and Escape then close
	// the dialog as usual. The latch lives here, not in the dialog: the
	// dialog unmounts and mounts again while `open` stays true, and a fresh
	// latch there would reopen a dialog the visitor dismissed.
	let openRequested = false;
	/** Whether the dialog showing is the one `open` asked for (below). */
	let claimed = false;
	const modelAllowed = $derived(
		!props.models || props.models.includes(consent.state.model)
	);
	$effect.pre(() => {
		if (props.open !== true) {
			openRequested = false;
			return;
		}
		if (openRequested || !consent.state.hasConsentUi || !modelAllowed) {
			return;
		}
		openRequested = true;
		claimed = true;
		const { kernel } = consent;
		untrack(() => {
			if (kernel.getSnapshot().activeUI !== 'dialog') {
				showConsentSurface(kernel, 'dialog');
			}
		});
	});

	// A controlled `open` turning false closes the dialog it asked for.
	// Once the dialog renders, it does that itself. Before that, while its chunk still loads, `open` turning
	// false closes it here through the consent manager, as Close does, so
	// an unanswered banner comes back and the dialog that arrives later
	// stays closed. A dialog the consent manager opened while `open` was
	// already false stays its own.
	$effect.pre(() => {
		if (props.open !== false) {
			return;
		}
		const wasClaimed = claimed;
		claimed = false;
		if (!wasClaimed) {
			return;
		}
		const { kernel } = consent;
		untrack(() => {
			if (!Dialog && kernel.getSnapshot().activeUI === 'dialog') {
				showConsentSurface(kernel, 'none');
			}
		});
	});

	const load = async function load() {
		if (Dialog) {
			return;
		}
		try {
			Dialog = await loadDialog();
		} catch {
			// The banner and the trigger hide while the dialog is open, so a
			// dialog that failed to load would leave no consent UI. Put back the
			// surface it replaced; the next warm or open retries the import.
			if (
				(props.open === undefined || openRequested) &&
				consent.state.activeUI === 'dialog'
			) {
				consent.state.setActiveUI(surfaceBeforeDialog);
			}
		}
	};

	onMount(() =>
		registerDialogWarmer(() => {
			void load();
		})
	);

	// A shown banner can open the dialog at any moment, and it has no
	// Customize button that opens it, so the dialog holds the idle warming
	// itself, as React's does.
	const theme = getThemeContext();
	$effect(() => {
		if (consent.state.activeUI === 'banner') {
			return holdIdleDialogWarming(theme.preloadDialog);
		}
	});

	// The dialog is needed as soon as it opens. It loads on open, never with
	// the banner or the trigger (PERM-05: the banner leaves at once when it
	// opens).
	const needed = $derived(props.open ?? consent.state.activeUI === 'dialog');

	$effect(() => {
		if (needed) {
			void load();
		}
	});

	// The floating trigger for `showTrigger`, in a chunk of its own.
	const triggerProps = $derived.by((): ConsentDialogTriggerProps | null => {
		if (props.showTrigger === true) {
			return {};
		}
		return props.showTrigger ? props.showTrigger : null;
	});
	let Trigger = $state<typeof ConsentDialogTriggerComponent | null>(null);
	$effect(() => {
		if (!triggerProps || Trigger) {
			return;
		}
		void (async () => {
			try {
				Trigger = await loadTrigger();
			} catch {
				// The next render that wants it retries.
			}
		})();
	});

	// The dialog confirms an opt-out on its receipt: the opt-out confirmation (after a revocation reload, or from a
	// one-click opt-out link) opens the dialog there instead. A standalone
	// `OptOutConfirmation` the host mounted still shows it itself.
	const confirmation = useOptOutConfirmationState(() => consent.kernel);
	const embeddedConfirmation = $derived(
		confirmation.open && !confirmation.hasStandaloneHost
	);
	// The dialog can render now: its `models` allow the policy's model, and
	// a controlled `open={false}` does not keep it hidden. Only then can it
	// take the opt-out confirmation over.
	const dialogCanShow = $derived(modelAllowed && props.open !== false);
	const adoptConfirmation = $derived(embeddedConfirmation && dialogCanShow);
	$effect(() => {
		if (!adoptConfirmation) {
			return;
		}
		const { kernel } = consent;
		untrack(() => {
			requestReceiptFocus(kernel);
			// Opening the dialog closes the confirmation.
			showConsentSurface(kernel, 'dialog');
		});
	});
</script>

{#if Trigger && triggerProps}
	<Trigger {...triggerProps} />
{/if}
{#if embeddedConfirmation && !dialogCanShow}
	<!-- This dialog does not open under the model, or the host keeps it
	     closed, so the confirmation shows on its own. -->
	<DeferredOptOutConfirmation
		embedded
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
	/>
{/if}
<DeferredOptInConfirmation
	noStyle={props.noStyle}
	disableAnimation={props.disableAnimation}
	scrollLock={props.scrollLock}
	trapFocus={props.trapFocus}
/>
{#if Dialog && (props.open === true || consent.state.activeUI === 'dialog')}
	<Dialog
		open={props.open}
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
		models={props.models}
		legalLinks={props.legalLinks}
	/>
{/if}
