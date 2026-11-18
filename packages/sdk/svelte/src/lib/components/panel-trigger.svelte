<script lang="ts">
	import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
	import {
		defaultTranslationConfig,
		resolveTriggerLabels,
	} from '@inth/sdk/surface-state';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
	import {
		calculateCornerFromDrag,
		createInitialDragState,
		getPersistedPosition,
		isTriggerVisible,
		nextToolbarItem,
		onSnapEnd,
		persistPosition as persistToStorage,
		resolveBrandMark,
		resolveStyles,
		toStyleAttributeValue,
		resolveTranslations,
		toolbarOrder,
	} from '@inth/sdk/ui/utils';
	import type {
		CornerPosition,
		DragState,
		TriggerToolbarItem,
	} from '@inth/sdk/ui/utils';
	import {
		claimDevToolsLauncher,
		EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT,
		followDevToolsDock,
		getDevToolsLauncherSnapshot,
		subscribeDevToolsLauncher,
	} from '@inth/sdk/ui/utils/devtools-launcher';
	import type {
		DevToolsLauncherSnapshot,
		DevToolsLauncherTarget,
	} from '@inth/sdk/ui/utils/devtools-launcher';
	import { onMount, untrack } from 'svelte';

	import { portal } from '../actions/portal';
	import { getConsentContext, getThemeContext } from '../context.svelte';
	import { holdIdleDialogWarming, warmDialog } from '../dialog-warming';
	import { TRIGGER_SHEETS } from '../surface-styles';
	import BrandMark from './icons/brand-mark.svelte';
	import DevToolsIcon from './icons/dev-tools-icon.svelte';
	import SurfaceStyles from './surface-styles.svelte';

	let {
		defaultPosition = 'bottom-right' as CornerPosition,
		persistPosition = true,
		showWhen = 'always' as ConsentDialogTriggerVisibility,
		size = 'md' as 'sm' | 'md' | 'lg',
		ariaLabel,
		noStyle = false,
		class: className,
		onclick,
		onPositionChange,
	}: {
		defaultPosition?: CornerPosition;
		persistPosition?: boolean;
		/**
		 * `always`, `after-consent` (once no prompt is owed) or `never`.
		 */
		showWhen?: ConsentDialogTriggerVisibility;
		size?: 'sm' | 'md' | 'lg';
		/** Defaults to the `trigger.label` translation. */
		ariaLabel?: string;
		noStyle?: boolean;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		onPositionChange?: (position: CornerPosition) => void;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	let corner: CornerPosition = $state(untrack(() => defaultPosition));

	let dragState: DragState = $state(createInitialDragState());
	let isSnapping = $state(false);
	let hasDragged = $state(false);
	let dragStartTime = $state(0);
	let capturedElement: HTMLElement | null = null;

	onMount(() => {
		if (persistPosition) {
			const persisted = getPersistedPosition();
			if (persisted) {
				corner = persisted;
			}
		}
	});

	const brandMark = $derived(resolveBrandMark(consent.state.branding));
	const visible = $derived(
		isTriggerVisible({
			dialogOpen: consent.snapshot.activeUI === 'dialog',
			hasConsentPreferences: consent.state.hasConsentPreferences,
			promptOwed: consent.snapshot.promptRequirement.kind !== 'none',
			showWhen,
		})
	);
	const labels = $derived(
		resolveTriggerLabels(
			resolveTranslations(
				consent.state.translationConfig,
				defaultTranslationConfig
			)
		)
	);
	const preferencesLabel = $derived(ariaLabel ?? labels.label);

	// Load the deferred dialog before the first click, but only while the
	// button is shown: a hidden trigger can't open the dialog.
	$effect(() => {
		if (visible) {
			return holdIdleDialogWarming(theme.preloadDialog);
		}
	});

	// With ConsentDevTools mounted for this kernel, the trigger becomes a
	// two-item toolbar that carries the DevTools launcher, so one control
	// occupies the corner.
	const launcherClaim = Symbol('ConsentDialogTrigger');
	let launcher: DevToolsLauncherSnapshot = $state.raw(
		EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT
	);

	$effect(() => {
		const { kernel } = consent;
		const read = () => {
			launcher = getDevToolsLauncherSnapshot(kernel);
		};
		read();
		return subscribeDevToolsLauncher(kernel, read);
	});

	const showToolbar = $derived(visible && launcher.instance !== null);

	// Claim the launcher only while the toolbar is on screen. Releasing it,
	// for example when the trigger hides, gives DevTools its launcher back.
	$effect(() => {
		if (showToolbar) {
			return claimDevToolsLauncher(consent.kernel, launcherClaim);
		}
	});

	// The first visible trigger owns the launcher; others render without it.
	const devTools: DevToolsLauncherTarget | null = $derived(
		launcher.owner === launcherClaim ? launcher.instance : null
	);
	const isDragging = $derived(dragState.isDragging);
	let toolbarElement: HTMLDivElement | undefined = $state();
	let buttonElement: HTMLButtonElement | undefined = $state();

	// Keep the docked panel beside the toolbar as it changes corner or size.
	// Skip mid-drag; the drop re-runs this.
	$effect(() => {
		const target = devTools;
		const element = toolbarElement;
		if (!target || !element || isDragging) {
			return;
		}
		return followDevToolsDock(element, corner, (placement) =>
			target.dock(placement)
		);
	});

	const toolbarItems: readonly TriggerToolbarItem[] = $derived(
		devTools ? toolbarOrder(corner) : ['preferences']
	);
	let focusedItem: TriggerToolbarItem | undefined = $state();
	const tabStopItem = $derived(
		focusedItem && toolbarItems.includes(focusedItem)
			? focusedItem
			: toolbarItems[0]
	);

	const cornerClassMap: Record<CornerPosition, string> = {
		'bottom-left': styles.bottomLeft || '',
		'bottom-right': styles.bottomRight || '',
		'top-left': styles.topLeft || '',
		'top-right': styles.topRight || '',
	};

	const sizeClassMap: Record<string, string> = {
		lg: styles.lg || '',
		md: styles.md || '',
		sm: styles.sm || '',
	};

	const positionClass = $derived(cornerClassMap[corner] || '');

	const dragStyle = $derived(
		dragState.isDragging
			? `transform: translate(${dragState.currentX - dragState.startX}px, ${dragState.currentY - dragState.startY}px); transition: none;`
			: 'transform: none;'
	);

	const updateCorner = function updateCorner(newCorner: CornerPosition) {
		corner = newCorner;
		if (persistPosition) {
			persistToStorage(newCorner);
		}
		onPositionChange?.(newCorner);
	};

	const handlePointerDown = function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0) {
			return;
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		capturedElement = e.target as HTMLElement;
		hasDragged = false;
		dragStartTime = Date.now();

		dragState = {
			currentX: e.clientX,
			currentY: e.clientY,
			isDragging: true,
			startX: e.clientX,
			startY: e.clientY,
		};

		isSnapping = false;
	};

	const handlePointerMove = function handlePointerMove(e: PointerEvent) {
		if (!dragState.isDragging) {
			return;
		}

		const dx = Math.abs(e.clientX - dragState.startX);
		const dy = Math.abs(e.clientY - dragState.startY);
		if (dx > 5 || dy > 5) {
			hasDragged = true;
		}

		dragState = {
			...dragState,
			currentX: e.clientX,
			currentY: e.clientY,
		};
	};

	const handlePointerUp = function handlePointerUp(e: PointerEvent) {
		if (capturedElement) {
			capturedElement.releasePointerCapture(e.pointerId);
			capturedElement = null;
		}

		if (!dragState.isDragging) {
			return;
		}

		if (hasDragged) {
			const dragX = e.clientX - dragState.startX;
			const dragY = e.clientY - dragState.startY;
			const dragDuration = Date.now() - dragStartTime;

			const velocityX = dragDuration > 0 ? dragX / dragDuration : 0;
			const velocityY = dragDuration > 0 ? dragY / dragDuration : 0;

			const newCorner = calculateCornerFromDrag(corner, dragX, dragY, {
				velocityX,
				velocityY,
			});

			if (newCorner !== corner) {
				isSnapping = true;
				updateCorner(newCorner);
			}
		}

		dragState = createInitialDragState();
	};

	const handlePointerCancel = function handlePointerCancel(e: PointerEvent) {
		if (capturedElement) {
			capturedElement.releasePointerCapture(e.pointerId);
			capturedElement = null;
		}
		dragState = createInitialDragState();
	};

	const handleDevToolsClick = function handleDevToolsClick() {
		if (hasDragged) {
			return;
		}
		devTools?.toggle();
	};

	// The snap ends with the trigger's own transition, once the snapping
	// class and the new corner have rendered.
	$effect(() => {
		const element = showToolbar ? toolbarElement : buttonElement;
		if (!(isSnapping && element)) {
			return;
		}
		return onSnapEnd(element, () => {
			isSnapping = false;
		});
	});

	const handleToolbarKeyDown = function handleToolbarKeyDown(e: KeyboardEvent) {
		const next = nextToolbarItem(toolbarItems, tabStopItem, e.key);
		if (!next) {
			return;
		}
		e.preventDefault();
		focusedItem = next;
		toolbarElement
			?.querySelector<HTMLElement>(`[data-inth-trigger-item="${next}"]`)
			?.focus();
	};

	const handleClick = function handleClick(e: MouseEvent) {
		if (hasDragged) {
			return;
		}
		onclick?.(e);
		if (!e.defaultPrevented) {
			consent.state.setActiveUI('dialog');
		}
	};

	const triggerStyle = $derived(
		resolveStyles(
			'consentDialogTrigger',
			theme.theme,
			{
				baseClassName: [
					styles.trigger,
					positionClass,
					sizeClassMap[size],
					dragState.isDragging && styles.dragging,
					isSnapping && styles.snapping,
				],
				className,
				noStyle,
			},
			noStyle
		)
	);
	const iconStyle = $derived(
		resolveStyles(
			'consentDialogTriggerIcon',
			theme.theme,
			{ baseClassName: styles.icon, noStyle },
			noStyle
		)
	);
	const toolbarStyle = $derived(
		resolveStyles(
			'consentDialogTriggerToolbar',
			theme.theme,
			{
				baseClassName: [
					styles.toolbar,
					positionClass,
					dragState.isDragging && styles.dragging,
					isSnapping && styles.snapping,
				],
				noStyle,
			},
			noStyle
		)
	);
	const preferencesItemStyle = $derived(
		resolveStyles(
			'consentDialogTriggerToolbarItem',
			theme.theme,
			{
				baseClassName: [styles.toolbarItem, sizeClassMap[size]],
				className,
				noStyle,
			},
			noStyle
		)
	);
	const devToolsItemStyle = $derived(
		resolveStyles(
			'consentDialogTriggerToolbarItem',
			theme.theme,
			{ baseClassName: [styles.toolbarItem, sizeClassMap[size]], noStyle },
			noStyle
		)
	);
	const toolbarIconStyle = $derived(
		resolveStyles(
			'consentDialogTriggerToolbarIcon',
			theme.theme,
			{ baseClassName: styles.toolbarIcon, noStyle },
			noStyle
		)
	);
	const toolbarAttributeStyle = $derived(
		[toStyleAttributeValue(toolbarStyle.style), dragStyle]
			.filter(Boolean)
			.join(';') || undefined
	);
	const buttonStyle = $derived(
		[toStyleAttributeValue(triggerStyle.style), dragStyle]
			.filter(Boolean)
			.join(';') || undefined
	);
</script>

{#snippet brandingIcon()}
	<BrandMark mark={brandMark} />
{/snippet}

{#if visible}
	<div use:portal>
		<!-- Inside the portal: the block must stay one node, or removing it
		     would walk from where it was to where the portal moved it. -->
		<SurfaceStyles sheets={TRIGGER_SHEETS} />
		{#if showToolbar}
			<div
				bind:this={toolbarElement}
				class={toolbarStyle.className || ''}
				style={toolbarAttributeStyle}
				role="toolbar"
				tabindex="-1"
				dir="ltr"
				aria-label={labels.toolbarLabel}
				aria-orientation="horizontal"
				data-corner={corner}
				data-inth-trigger-toolbar="true"
				data-inth-trigger="true"
				data-disable-animation={theme.disableAnimation ? '' : undefined}
				data-dragging={isDragging || undefined}
				data-snapping={isSnapping || undefined}
				onkeydown={handleToolbarKeyDown}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerCancel}
			>
				{#each toolbarItems as item (item)}
					{#if item === 'devtools'}
						<button
							type="button"
							class={devToolsItemStyle.className || ''}
							style={toStyleAttributeValue(devToolsItemStyle.style)}
							tabindex={tabStopItem === item ? 0 : -1}
							aria-label={labels.devToolsLabel}
							aria-expanded={launcher.isOpen}
							data-inth-trigger-action="devtools"
							data-inth-trigger-item="devtools"
							onclick={handleDevToolsClick}
							onfocus={() => (focusedItem = item)}
						>
							<span
								class={toolbarIconStyle.className || ''}
								style={toStyleAttributeValue(toolbarIconStyle.style)}
								aria-hidden="true"
							>
								<span
									class={iconStyle.className || ''}
									style={toStyleAttributeValue(iconStyle.style)}
								>
									<DevToolsIcon />
								</span>
							</span>
						</button>
					{:else}
						<button
							type="button"
							class={preferencesItemStyle.className || ''}
							style={toStyleAttributeValue(preferencesItemStyle.style)}
							tabindex={tabStopItem === item ? 0 : -1}
							aria-label={preferencesLabel}
							data-inth-rights={consent.snapshot.policyRule.rights.join(' ')}
							data-inth-trigger-action="preferences"
							data-inth-trigger-item="preferences"
							onclick={handleClick}
							onpointerenter={warmDialog}
							onfocus={() => {
								focusedItem = item;
								warmDialog();
							}}
							data-testid="consent-dialog-trigger"
						>
							<span
								class={toolbarIconStyle.className || ''}
								style={toStyleAttributeValue(toolbarIconStyle.style)}
								aria-hidden="true"
							>
								<span
									class={iconStyle.className || ''}
									style={toStyleAttributeValue(iconStyle.style)}
								>
									{@render brandingIcon()}
								</span>
							</span>
						</button>
					{/if}
				{/each}
			</div>
		{:else}
			<button
				bind:this={buttonElement}
				type="button"
				class={triggerStyle.className || ''}
				style={buttonStyle}
				data-inth-trigger="true"
				data-inth-rights={consent.snapshot.policyRule.rights.join(' ')}
				data-disable-animation={theme.disableAnimation ? '' : undefined}
				aria-label={preferencesLabel}
				onclick={handleClick}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerCancel}
				onpointerenter={warmDialog}
				onfocus={warmDialog}
				data-testid="consent-dialog-trigger"
			>
				<span
					class={iconStyle.className || ''}
					style={toStyleAttributeValue(iconStyle.style)}
					aria-hidden="true"
				>
					{@render brandingIcon()}
				</span>
			</button>
		{/if}
	</div>
{/if}
