<script
	lang="ts"
	module
>
	import type PanelComponent from './panel.svelte';

	let pending: Promise<typeof PanelComponent> | null = null;

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
	 * Where focus returns after the dialog: the opener itself, or the element
	 * that took its place. A banner's Customize button is gone while the
	 * dialog is open, and the banner renders a new one when it comes back.
	 */
	const focusReturnTarget = function focusReturnTarget(
		opener: HTMLElement
	): HTMLElement | null {
		if (opener.isConnected) {
			return opener;
		}
		if (opener.id) {
			const byId = document.getElementById(opener.id);
			if (byId) {
				return byId;
			}
		}
		const testId = opener.getAttribute('data-testid');
		if (testId) {
			return document.querySelector<HTMLElement>(
				`[data-testid="${testId.replaceAll(/["\\]/gu, '\\$&')}"]`
			);
		}
		return null;
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
	import { onMount } from 'svelte';

	import { getConsentContext } from '../context.svelte';
	import { registerDialogWarmer } from '../dialog-warming';
	import type { ConsentDialogProps } from './panel-props';

	const props: ConsentDialogProps = $props();

	const consent = getConsentContext();
	let Panel = $state<typeof PanelComponent | null>(null);

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
			focusReturnTarget(previous)?.focus({ preventScroll: true });
		}, 0);
		return () => clearTimeout(timer);
	});

	const load = async function load() {
		if (Panel) {
			return;
		}
		try {
			Panel = await loadPanel();
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

	// The dialog is needed as soon as it opens, and at once when it renders
	// its own trigger.
	const needed = $derived(
		Boolean(props.showTrigger) ||
			(props.open ?? consent.state.activeUI === 'dialog')
	);

	$effect(() => {
		if (needed) {
			void load();
		}
	});
</script>

{#if Panel}
	<Panel {...props} />
{/if}
