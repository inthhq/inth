<script
	lang="ts"
	module
>
	import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';

	import type ConsentDialogTriggerComponent from './panel-trigger.svelte';
	import type PanelComponent from './panel.svelte';
	import type PrivacyChoicesDialogComponent from './privacy-choices-dialog/dialog.svelte';

	let pending: Promise<typeof PanelComponent> | null = null;
	let pendingPrivacyChoices: Promise<
		typeof PrivacyChoicesDialogComponent
	> | null = null;
	let pendingTrigger: Promise<typeof ConsentDialogTriggerComponent> | null =
		null;

	/**
	 * One import shared by every `ConsentDialog` on the page. A failed import
	 * is forgotten, so the next hover, focus or open retries it.
	 */
	const loadPanel = function loadPanel(): Promise<typeof PanelComponent> {
		pending ??= (async () => {
			try {
				return (await import('./panel.svelte')).default;
			} catch (error) {
				pending = null;
				throw error;
			}
		})();
		return pending;
	};

	/**
	 * The v6 "Your Privacy Choices" dialog (`design: 'privacy-choices'`), in
	 * a chunk of its own with its stylesheet. A page on the classic design
	 * never loads it.
	 */
	const loadPrivacyChoicesDialog = function loadPrivacyChoicesDialog(): Promise<
		typeof PrivacyChoicesDialogComponent
	> {
		pendingPrivacyChoices ??= (async () => {
			try {
				return (await import('./privacy-choices-dialog/dialog.svelte')).default;
			} catch (error) {
				pendingPrivacyChoices = null;
				throw error;
			}
		})();
		return pendingPrivacyChoices;
	};

	/**
	 * The floating trigger a Privacy Choices `ConsentDialog` renders for
	 * `showTrigger`. The classic dialog brings its own with its chunk.
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
	import { resolveConsentPresentation } from '@inth/sdk/engine';
	import { showConsentSurface } from '@inth/sdk/surface-actions';
	import { onMount, untrack } from 'svelte';

	import { getConsentContext, getThemeContext } from '../context.svelte';
	import {
		holdIdleDialogWarming,
		registerDialogWarmer,
	} from '../dialog-warming';
	import { useOptOutConfirmationState } from '../opt-out-confirmation-state.svelte';
	import DeferredOptInConfirmation from './deferred-opt-in-confirmation.svelte';
	import DeferredOptOutConfirmation from './deferred-opt-out-confirmation.svelte';
	import type {
		ConsentDialogProps,
		ConsentDialogTriggerProps,
	} from './panel-props';
	import { requestReceiptFocus } from './privacy-choices/receipt-focus';

	const props: ConsentDialogProps = $props();

	const consent = getConsentContext();
	let Panel = $state<typeof PanelComponent | null>(null);
	let PrivacyChoicesDialog = $state<
		typeof PrivacyChoicesDialogComponent | null
	>(null);

	// The design the banner renders, so warming and opening load only that
	// design's dialog.
	const privacyChoices = $derived(
		resolveConsentPresentation({
			policy: consent.snapshot.policyRule,
			presentation: consent.state.presentation,
			surface: 'prompt',
		}).design === 'privacy-choices'
	);

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

	const load = async function load() {
		const v6 = untrack(() => privacyChoices);
		if (v6 ? PrivacyChoicesDialog : Panel) {
			return;
		}
		try {
			if (v6) {
				PrivacyChoicesDialog = await loadPrivacyChoicesDialog();
			} else {
				Panel = await loadPanel();
			}
		} catch {
			// The banner and the trigger hide while the dialog is open, so a
			// dialog that failed to load would leave no consent UI. Put back the
			// surface it replaced; the next warm or open retries the import.
			if (props.open === undefined && consent.state.activeUI === 'dialog') {
				consent.state.setActiveUI(surfaceBeforeDialog);
			}
		}
	};

	onMount(() =>
		registerDialogWarmer(() => {
			void load();
		})
	);

	// A shown v6 banner can open the dialog at any moment, and it has no
	// Customize button that opens it, so the dialog holds the idle warming
	// itself, as React's does. The classic banner's Customize holds it.
	const theme = getThemeContext();
	$effect(() => {
		if (privacyChoices && consent.state.activeUI === 'banner') {
			return holdIdleDialogWarming(theme.preloadDialog);
		}
	});

	// The dialog is needed as soon as it opens, and at once when it renders
	// its own trigger. The v6 dialog has no trigger of its own: it loads on
	// open, never with the banner (PERM-05: the banner leaves at once when
	// it opens).
	const needed = $derived(
		(!privacyChoices && Boolean(props.showTrigger)) ||
			(props.open ?? consent.state.activeUI === 'dialog')
	);

	$effect(() => {
		if (needed) {
			void load();
		}
	});

	// The Privacy Choices design still renders the floating trigger for
	// `showTrigger`, in a chunk of its own.
	const triggerProps = $derived.by((): ConsentDialogTriggerProps | null => {
		if (props.showTrigger === true) {
			return {};
		}
		return props.showTrigger ? props.showTrigger : null;
	});
	let Trigger = $state<typeof ConsentDialogTriggerComponent | null>(null);
	$effect(() => {
		if (!(privacyChoices && triggerProps) || Trigger) {
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

	// The Privacy Choices design confirms an opt-out on its receipt, in the
	// dialog: the opt-out confirmation (after a revocation reload, or from a
	// one-click opt-out link) opens the dialog there instead. A standalone
	// `OptOutConfirmation` the host mounted still shows it itself.
	const confirmation = useOptOutConfirmationState(() => consent.kernel);
	const embeddedConfirmation = $derived(
		confirmation.open && !confirmation.hasStandaloneHost
	);
	const dialogAllowed = $derived(
		!props.models || props.models.includes(consent.state.model)
	);
	const adoptConfirmation = $derived(
		privacyChoices && embeddedConfirmation && dialogAllowed
	);
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

{#if privacyChoices}
	{#if Trigger && triggerProps}
		<Trigger {...triggerProps} />
	{/if}
	{#if embeddedConfirmation && !dialogAllowed}
		<!-- This dialog does not open under the model, so the confirmation
		     shows as on the classic design. -->
		<DeferredOptOutConfirmation
			embedded
			noStyle={props.noStyle}
			disableAnimation={props.disableAnimation}
		/>
	{/if}
	<DeferredOptInConfirmation
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
	/>
	{#if PrivacyChoicesDialog && (props.open === true || consent.state.activeUI === 'dialog')}
		<PrivacyChoicesDialog
			open={props.open}
			noStyle={props.noStyle}
			disableAnimation={props.disableAnimation}
			models={props.models}
		/>
	{/if}
{:else}
	<DeferredOptOutConfirmation
		embedded
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
	/>
	<DeferredOptInConfirmation
		noStyle={props.noStyle}
		disableAnimation={props.disableAnimation}
	/>

	{#if Panel}
		<Panel
			{...props}
			embedOptOutConfirmation={false}
		/>
	{/if}
{/if}
