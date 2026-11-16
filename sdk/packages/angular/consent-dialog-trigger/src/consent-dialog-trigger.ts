import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	linkedSignal,
	output,
	PLATFORM_ID,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import {
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	holdIdleDialogWarming,
	Portal,
	resolveComponentStyles,
	SURFACE_SCOPES,
	toStyleAttribute,
	TRIGGER_SHEETS,
	warmDialog,
	ɵBrandMarkIcon as BrandMarkIcon,
	ɵNoStyleScope as NoStyleScope,
	ɵresolveNoStyle as resolveNoStyle,
} from '@c15t/angular';
import styles from '@c15t/ui/styles/components/consent-dialog-trigger';
import type { ClassNameStyle } from '@c15t/ui/theme';
import {
	calculateCornerFromDrag,
	createInitialDragState,
	getPersistedPosition,
	persistPosition as persistToStorage,
} from '@c15t/ui/utils';
import type { CornerPosition, DragState } from '@c15t/ui/utils';
import {
	claimDevToolsLauncher,
	EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT,
	followDevToolsDock,
	getDevToolsLauncherSnapshot,
	subscribeDevToolsLauncher,
} from '@c15t/ui/utils/devtools-launcher';
import type {
	DevToolsLauncherSnapshot,
	DevToolsLauncherTarget,
} from '@c15t/ui/utils/devtools-launcher';

import { ConsentIcon, DevToolsIcon } from './trigger-icons';

/** The corner the trigger sits in. */
export type ConsentDialogTriggerPosition = CornerPosition;

/** When the trigger shows. */
export type ConsentDialogTriggerVisibility = 'always' | 'never';

/** The trigger's size. */
export type ConsentDialogTriggerSize = 'sm' | 'md' | 'lg';

type ToolbarItem = 'devtools' | 'preferences';

/** Moves under this many pixels count as a click, not a drag. */
const DRAG_THRESHOLD_PX = 5;
const SNAP_DURATION_MS = 300;

const joinStyles = function joinStyles(
	...parts: (string | undefined)[]
): string | null {
	return parts.filter(Boolean).join(';') || null;
};

/**
 * A floating button that opens the consent dialog, so visitors can change
 * their choice later. Drag it to another corner; it remembers the corner.
 *
 * It shows once a policy rule that keeps a route to preferences is
 * resolved, and hides while the dialog is open. With
 * `<c15t-consent-dev-tools>` mounted it becomes a two-button toolbar that
 * also opens DevTools.
 *
 * @example
 * ```html
 * <c15t-consent-dialog-trigger defaultPosition="bottom-left" size="sm" />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BrandMarkIcon, ConsentIcon, DevToolsIcon, NgTemplateOutlet, Portal],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'c15t-consent-dialog-trigger',
	template: `<ng-template #brandingIcon>
			@if (consent.branding() === 'consent') {
				<svg c15t-consent-icon></svg>
			} @else {
				<svg c15t-brand-mark-icon></svg>
			}
		</ng-template>
		@if (visible()) {
			<div c15tPortal>
				@if (showToolbar()) {
					<div
						#toolbar
						[class]="toolbarStyle().className || ''"
						[attr.style]="toolbarAttributeStyle()"
						role="toolbar"
						tabindex="-1"
						dir="ltr"
						aria-label="Privacy controls"
						aria-orientation="horizontal"
						[attr.data-corner]="corner()"
						data-c15t-trigger-toolbar="true"
						data-c15t-trigger="true"
						[attr.data-disable-animation]="theme.disableAnimation() ? '' : null"
						[attr.data-dragging]="isDragging() || null"
						[attr.data-snapping]="isSnapping() || null"
						(keydown)="moveToolbarFocus($event)"
						(pointerdown)="startDrag($event)"
						(pointermove)="drag($event)"
						(pointerup)="endDrag($event)"
						(pointercancel)="cancelDrag($event)"
					>
						@for (item of toolbarItems(); track item) {
							@if (item === 'devtools') {
								<button
									type="button"
									[class]="devToolsItemStyle().className || ''"
									[attr.style]="styleOf(devToolsItemStyle())"
									[attr.tabindex]="tabStopItem() === item ? 0 : -1"
									aria-label="c15t DevTools"
									[attr.aria-expanded]="launcher().isOpen"
									data-c15t-trigger-action="devtools"
									data-c15t-trigger-item="devtools"
									(click)="toggleDevTools()"
									(focus)="focusedItem.set(item)"
								>
									<span
										[class]="toolbarIconStyle().className || ''"
										[attr.style]="styleOf(toolbarIconStyle())"
										aria-hidden="true"
									>
										<span
											[class]="iconStyle().className || ''"
											[attr.style]="styleOf(iconStyle())"
										>
											<svg c15t-dev-tools-icon></svg>
										</span>
									</span>
								</button>
							} @else {
								<button
									type="button"
									[class]="preferencesItemStyle().className || ''"
									[attr.style]="styleOf(preferencesItemStyle())"
									[attr.tabindex]="tabStopItem() === item ? 0 : -1"
									[attr.aria-label]="label()"
									[attr.data-c15t-rights]="rights()"
									data-c15t-trigger-action="preferences"
									data-c15t-trigger-item="preferences"
									(click)="openDialog($event)"
									(pointerenter)="warm()"
									(focus)="focusedItem.set(item); warm()"
									data-testid="consent-dialog-trigger"
								>
									<span
										[class]="toolbarIconStyle().className || ''"
										[attr.style]="styleOf(toolbarIconStyle())"
										aria-hidden="true"
									>
										<span
											[class]="iconStyle().className || ''"
											[attr.style]="styleOf(iconStyle())"
										>
											<ng-container [ngTemplateOutlet]="brandingIcon" />
										</span>
									</span>
								</button>
							}
						}
					</div>
				} @else {
					<button
						type="button"
						[class]="triggerStyle().className || ''"
						[attr.style]="buttonStyle()"
						data-c15t-trigger="true"
						[attr.data-c15t-rights]="rights()"
						[attr.data-disable-animation]="theme.disableAnimation() ? '' : null"
						[attr.aria-label]="label()"
						(click)="openDialog($event)"
						(pointerdown)="startDrag($event)"
						(pointermove)="drag($event)"
						(pointerup)="endDrag($event)"
						(pointercancel)="cancelDrag($event)"
						(pointerenter)="warm()"
						(focus)="warm()"
						data-testid="consent-dialog-trigger"
					>
						<span
							[class]="iconStyle().className || ''"
							[attr.style]="styleOf(iconStyle())"
							aria-hidden="true"
						>
							<ng-container [ngTemplateOutlet]="brandingIcon" />
						</span>
					</button>
				}
			</div>
		}`,
})
export class ConsentDialogTrigger {
	/** @internal */
	protected readonly consent = inject(ConsentManager);
	/** @internal */
	protected readonly theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/** The corner the trigger starts in. */
	readonly defaultPosition =
		input<ConsentDialogTriggerPosition>('bottom-right');
	/** Remember the corner the visitor dragged it to, in local storage. */
	readonly persistPosition = input(true);
	/** `'never'` hides the trigger. */
	readonly showWhen = input<ConsentDialogTriggerVisibility>('always');
	/** The trigger's size. */
	readonly size = input<ConsentDialogTriggerSize>('md');
	/** The button's accessible name. */
	readonly label = input('Open privacy settings');
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Extra class for the button. */
	readonly rootClass = input<string | undefined>(undefined);
	readonly #resolvedNoStyle = resolveNoStyle(this.noStyle);

	/**
	 * Emits on a click that is not the end of a drag, before the dialog
	 * opens. Call `preventDefault()` on the event to keep it closed.
	 */
	readonly triggerClick = output<MouseEvent>();
	/** Emits the corner the visitor dragged the trigger to. */
	readonly positionChange = output<ConsentDialogTriggerPosition>();

	/** @internal */
	// Follows `defaultPosition` until a drag or the persisted corner moves
	// it.
	protected readonly corner = linkedSignal<CornerPosition>(() =>
		this.defaultPosition()
	);
	readonly #dragState = signal<DragState>(createInitialDragState());
	/** @internal */
	protected readonly isSnapping = signal(false);
	#hasDragged = false;
	#dragStartTime = 0;
	#captured: HTMLElement | null = null;

	/** @internal */
	protected readonly isDragging = computed(() => this.#dragState().isDragging);

	/** @internal */
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);

	/** Nothing to manage without a resolved policy. @internal */
	protected readonly visible = computed(
		() =>
			this.consent.hasConsentPreferences() &&
			this.showWhen() !== 'never' &&
			this.consent.snapshot().activeUI !== 'dialog'
	);

	readonly #launcherClaim = Symbol('ConsentDialogTrigger');
	/** @internal */
	protected readonly launcher = signal<DevToolsLauncherSnapshot>(
		EMPTY_DEVTOOLS_LAUNCHER_SNAPSHOT
	);
	/** @internal */
	protected readonly showToolbar = computed(
		() => this.visible() && this.launcher().instance !== null
	);
	// The first visible trigger owns the launcher; others render without it.
	readonly #devTools = computed<DevToolsLauncherTarget | null>(() => {
		const launcher = this.launcher();
		return launcher.owner === this.#launcherClaim ? launcher.instance : null;
	});

	private readonly toolbar = viewChild<ElementRef<HTMLDivElement>>('toolbar');

	// Preferences sits in the corner; DevTools, a development aid, sits
	// farthest from it.
	/** @internal */
	protected readonly toolbarItems = computed<ToolbarItem[]>(() => {
		if (!this.#devTools()) {
			return ['preferences'];
		}
		return this.corner().endsWith('left')
			? ['preferences', 'devtools']
			: ['devtools', 'preferences'];
	});
	/** @internal */
	protected readonly focusedItem = signal<ToolbarItem | undefined>(undefined);
	/** @internal */
	protected readonly tabStopItem = computed(() => {
		const focused = this.focusedItem();
		const items = this.toolbarItems();
		return focused && items.includes(focused) ? focused : items[0];
	});

	readonly #positionClass = computed(() => {
		const map: Record<CornerPosition, string | undefined> = {
			'bottom-left': styles.bottomLeft,
			'bottom-right': styles.bottomRight,
			'top-left': styles.topLeft,
			'top-right': styles.topRight,
		};
		return map[this.corner()] || '';
	});
	readonly #sizeClass = computed(() => {
		const map: Record<ConsentDialogTriggerSize, string | undefined> = {
			lg: styles.lg,
			md: styles.md,
			sm: styles.sm,
		};
		return map[this.size()] || '';
	});
	readonly #dragStyle = computed(() => {
		const state = this.#dragState();
		return state.isDragging
			? `transform: translate(${state.currentX - state.startX}px, ${state.currentY - state.startY}px); transition: none;`
			: 'transform: none;';
	});

	/** @internal */
	protected readonly triggerStyle = computed(() =>
		this.#resolve(
			'consentDialogTrigger',
			[
				styles.trigger,
				this.#positionClass(),
				this.#sizeClass(),
				this.isDragging() && styles.dragging,
				this.isSnapping() && styles.snapping,
			],
			this.rootClass()
		)
	);
	/** @internal */
	protected readonly iconStyle = computed(() =>
		this.#resolve('consentDialogTriggerIcon', styles.icon)
	);
	/** @internal */
	protected readonly toolbarStyle = computed(() =>
		this.#resolve('consentDialogTriggerToolbar', [
			styles.toolbar,
			this.#positionClass(),
			this.isDragging() && styles.dragging,
			this.isSnapping() && styles.snapping,
		])
	);
	/** @internal */
	protected readonly preferencesItemStyle = computed(() =>
		this.#resolve(
			'consentDialogTriggerToolbarItem',
			[styles.toolbarItem, this.#sizeClass()],
			this.rootClass()
		)
	);
	/** @internal */
	protected readonly devToolsItemStyle = computed(() =>
		this.#resolve('consentDialogTriggerToolbarItem', [
			styles.toolbarItem,
			this.#sizeClass(),
		])
	);
	/** @internal */
	protected readonly toolbarIconStyle = computed(() =>
		this.#resolve('consentDialogTriggerToolbarIcon', styles.toolbarIcon)
	);
	/** @internal */
	protected readonly toolbarAttributeStyle = computed(() =>
		joinStyles(toStyleAttribute(this.toolbarStyle().style), this.#dragStyle())
	);
	/** @internal */
	protected readonly buttonStyle = computed(() =>
		joinStyles(toStyleAttribute(this.triggerStyle().style), this.#dragStyle())
	);

	constructor() {
		effect(() => {
			if (this.visible()) {
				this.#styles.ensure(
					TRIGGER_SHEETS,
					this.#resolvedNoStyle(),
					SURFACE_SCOPES.trigger
				);
			}
		});

		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}

		afterNextRender(() => {
			if (untracked(this.persistPosition)) {
				const persisted = getPersistedPosition();
				if (persisted) {
					this.corner.set(persisted);
				}
			}
		});

		// Load the deferred dialog before the first click, but only while the
		// button is shown: a hidden trigger can't open the dialog.
		effect((onCleanup) => {
			if (this.visible()) {
				onCleanup(holdIdleDialogWarming(this.theme.preloadDialog()));
			}
		});

		// With ConsentDevTools mounted for this kernel, the trigger becomes a
		// two-item toolbar that carries the DevTools launcher.
		effect((onCleanup) => {
			const kernel = this.consent.kernel();
			const read = () => {
				this.launcher.set(getDevToolsLauncherSnapshot(kernel));
			};
			untracked(read);
			onCleanup(subscribeDevToolsLauncher(kernel, read));
		});

		// Claim the launcher only while the toolbar is on screen. Releasing
		// it, for example when the trigger hides, gives DevTools its launcher
		// back.
		effect((onCleanup) => {
			if (this.showToolbar()) {
				onCleanup(
					claimDevToolsLauncher(
						untracked(this.consent.kernel),
						this.#launcherClaim
					)
				);
			}
		});

		// Keep the docked panel beside the toolbar as it changes corner or
		// size. Skip mid-drag; the drop re-runs this.
		effect((onCleanup) => {
			const target = this.#devTools();
			const element = this.toolbar()?.nativeElement;
			const corner = this.corner();
			if (!target || !element || this.isDragging()) {
				return;
			}
			onCleanup(
				followDevToolsDock(element, corner, (placement) =>
					target.dock(placement)
				)
			);
		});

		inject(DestroyRef).onDestroy(() => {
			this.#captured = null;
		});
	}

	/** @internal */
	protected styleOf(style: ClassNameStyle): string | null {
		return toStyleAttribute(style.style) ?? null;
	}

	/** @internal */
	protected warm(): void {
		warmDialog();
	}

	/** @internal */
	protected startDrag(event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}
		const target = event.target as HTMLElement;
		target.setPointerCapture?.(event.pointerId);
		this.#captured = target;
		this.#hasDragged = false;
		this.#dragStartTime = Date.now();
		this.#dragState.set({
			currentX: event.clientX,
			currentY: event.clientY,
			isDragging: true,
			startX: event.clientX,
			startY: event.clientY,
		});
		this.isSnapping.set(false);
	}

	/** @internal */
	protected drag(event: PointerEvent): void {
		const state = this.#dragState();
		if (!state.isDragging) {
			return;
		}
		const dx = Math.abs(event.clientX - state.startX);
		const dy = Math.abs(event.clientY - state.startY);
		if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
			this.#hasDragged = true;
		}
		this.#dragState.set({
			...state,
			currentX: event.clientX,
			currentY: event.clientY,
		});
	}

	/** @internal */
	protected endDrag(event: PointerEvent): void {
		this.#release(event);
		const state = this.#dragState();
		if (!state.isDragging) {
			return;
		}
		if (this.#hasDragged) {
			const dragX = event.clientX - state.startX;
			const dragY = event.clientY - state.startY;
			const duration = Date.now() - this.#dragStartTime;
			const corner = this.corner();
			const next = calculateCornerFromDrag(corner, dragX, dragY, {
				velocityX: duration > 0 ? dragX / duration : 0,
				velocityY: duration > 0 ? dragY / duration : 0,
			});
			if (next !== corner) {
				this.isSnapping.set(true);
				setTimeout(() => {
					this.isSnapping.set(false);
				}, SNAP_DURATION_MS);
				this.corner.set(next);
				if (this.persistPosition()) {
					persistToStorage(next);
				}
				this.positionChange.emit(next);
			}
		}
		this.#dragState.set(createInitialDragState());
	}

	/** @internal */
	protected cancelDrag(event: PointerEvent): void {
		this.#release(event);
		// No click follows a cancelled pointer to spend the guard.
		this.#hasDragged = false;
		this.#dragState.set(createInitialDragState());
	}

	/** @internal */
	protected toggleDevTools(): void {
		if (this.#endsDrag()) {
			return;
		}
		this.#devTools()?.toggle();
	}

	/** @internal */
	protected moveToolbarFocus(event: KeyboardEvent): void {
		const items = this.toolbarItems();
		const current = this.tabStopItem();
		const index = current ? items.indexOf(current) : 0;
		let next: ToolbarItem | undefined;
		switch (event.key) {
			case 'ArrowRight':
				next = items[(index + 1) % items.length];
				break;
			case 'ArrowLeft':
				next = items[(index - 1 + items.length) % items.length];
				break;
			case 'Home':
				[next] = items;
				break;
			case 'End':
				next = items.at(-1);
				break;
			default:
				return;
		}
		event.preventDefault();
		if (next) {
			this.focusedItem.set(next);
			this.toolbar()
				?.nativeElement.querySelector<HTMLElement>(
					`[data-c15t-trigger-item="${next}"]`
				)
				?.focus();
		}
	}

	/** @internal */
	protected openDialog(event: MouseEvent): void {
		if (this.#endsDrag()) {
			return;
		}
		this.triggerClick.emit(event);
		if (!event.defaultPrevented) {
			this.consent.setActiveUI('dialog');
		}
	}

	/**
	 * Whether this click ends a drag, which is not a click. The guard is
	 * spent on it, so a later Enter or Space, which fires a click with no
	 * pointer press first, still acts.
	 */
	#endsDrag(): boolean {
		const dragged = this.#hasDragged;
		this.#hasDragged = false;
		return dragged;
	}

	#release(event: PointerEvent): void {
		if (this.#captured) {
			this.#captured.releasePointerCapture?.(event.pointerId);
			this.#captured = null;
		}
	}

	#resolve(
		key: Parameters<typeof resolveComponentStyles>[0],
		baseClassName: ClassNameStyle['baseClassName'],
		className?: string
	): ClassNameStyle {
		const noStyle = this.#resolvedNoStyle();
		return resolveComponentStyles(
			key,
			this.theme.theme(),
			{ baseClassName, className, noStyle },
			noStyle
		);
	}
}
