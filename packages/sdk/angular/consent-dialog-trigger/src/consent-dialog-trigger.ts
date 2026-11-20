import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	afterRenderEffect,
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
	SURFACE_SCOPES,
	TRIGGER_SHEETS,
	warmDialog,
	ɵBrandMarkIcon as BrandMarkIcon,
	ɵNoStyleScope as NoStyleScope,
	ɵresolveNoStyle as resolveNoStyle,
} from '@inth/angular';
import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
import { isOptOutTrigger } from '@inth/sdk/surface-actions';
import {
	resolveOptOutLink,
	resolveTriggerLabels,
} from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog-trigger';
import type { ClassNameStyle } from '@inth/sdk/ui/theme';
import {
	createInitialDragState,
	createTriggerDrag,
	getPersistedPosition,
	isTriggerVisible,
	nextToolbarItem,
	onSnapEnd,
	resolveBrandMark,
	resolveStyles,
	toStyleAttributeValue,
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

import { DevToolsIcon } from './trigger-icons';

/** The corner the trigger sits in. */
export type ConsentDialogTriggerPosition = CornerPosition;

export type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';

export type ConsentDialogTriggerSize = 'sm' | 'md' | 'lg';

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
 * `<inth-consent-dev-tools>` mounted it becomes a two-button toolbar that
 * also opens DevTools.
 *
 * @example
 * ```html
 * <inth-consent-dialog-trigger defaultPosition="bottom-left" size="sm" />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BrandMarkIcon, DevToolsIcon, NgTemplateOutlet, Portal],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-consent-dialog-trigger',
	template: `<ng-template #brandingIcon>
			<svg
				inth-brand-mark-icon
				[mark]="brandMark()"
			></svg>
		</ng-template>
		@if (visible()) {
			<div inthPortal>
				@if (showToolbar()) {
					<div
						#toolbar
						[class]="toolbarStyle().className || ''"
						[attr.style]="toolbarAttributeStyle()"
						role="toolbar"
						tabindex="-1"
						dir="ltr"
						[attr.aria-label]="labels().toolbarLabel"
						aria-orientation="horizontal"
						[attr.data-corner]="corner()"
						data-inth-trigger-toolbar="true"
						data-inth-trigger="true"
						[attr.data-disable-animation]="theme.disableAnimation() ? '' : null"
						[attr.data-dragging]="isDragging() || null"
						[attr.data-snapping]="isSnapping() || null"
						(keydown)="moveToolbarFocus($event)"
						(pointerdown)="startDrag($event)"
						(pointermove)="drag($event)"
						(pointerup)="endDrag($event)"
						(pointercancel)="cancelDrag()"
					>
						@for (item of toolbarItems(); track item) {
							@if (item === 'devtools') {
								<button
									type="button"
									[class]="devToolsItemStyle().className || ''"
									[attr.style]="styleOf(devToolsItemStyle())"
									[attr.tabindex]="tabStopItem() === item ? 0 : -1"
									[attr.aria-label]="labels().devToolsLabel"
									[attr.aria-expanded]="launcher().isOpen"
									data-inth-trigger-action="devtools"
									data-inth-trigger-item="devtools"
									(click)="toggleDevTools($event)"
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
											<svg inth-dev-tools-icon></svg>
										</span>
									</span>
								</button>
							} @else {
								<button
									type="button"
									[class]="preferencesItemStyle().className || ''"
									[attr.style]="styleOf(preferencesItemStyle())"
									[attr.tabindex]="tabStopItem() === item ? 0 : -1"
									[attr.aria-label]="resolvedLabel()"
									[attr.data-inth-rights]="rights()"
									data-inth-trigger-action="preferences"
									data-inth-trigger-item="preferences"
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
						#button
						type="button"
						[class]="triggerStyle().className || ''"
						[attr.style]="buttonStyle()"
						data-inth-trigger="true"
						[attr.data-inth-rights]="rights()"
						[attr.data-disable-animation]="theme.disableAnimation() ? '' : null"
						[attr.aria-label]="resolvedLabel()"
						(click)="openDialog($event)"
						(pointerdown)="startDrag($event)"
						(pointermove)="drag($event)"
						(pointerup)="endDrag($event)"
						(pointercancel)="cancelDrag()"
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
	protected readonly brandMark = computed(() =>
		resolveBrandMark(this.consent.branding())
	);
	/** @internal */
	protected readonly theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/** The corner the trigger starts in. */
	readonly defaultPosition =
		input<ConsentDialogTriggerPosition>('bottom-right');
	/** Remember the corner the visitor dragged it to, in local storage. */
	readonly persistPosition = input(true);
	/**
	 * `'always'` shows the trigger whenever the dialog is closed,
	 * `'after-consent'` once no prompt is owed, and `'never'` hides it.
	 */
	readonly showWhen = input<ConsentDialogTriggerVisibility>('always');
	readonly size = input<ConsentDialogTriggerSize>('md');
	/**
	 * The button's accessible name. Defaults to the `trigger.label`
	 * translation.
	 */
	readonly label = input<string | undefined>(undefined);
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
	readonly #drag = createTriggerDrag({
		corner: () => this.corner(),
		onCorner: (next) => {
			this.isSnapping.set(true);
			this.corner.set(next);
			this.positionChange.emit(next);
		},
		onDrag: (state) => this.#dragState.set(state),
		persist: () => this.persistPosition(),
	});

	/** @internal */
	protected readonly isDragging = computed(() => this.#dragState().isDragging);

	/** @internal */
	protected readonly rights = computed(() =>
		this.consent.snapshot().policyRule.rights.join(' ')
	);

	readonly #translations = this.consent.copy;
	/** @internal */
	protected readonly labels = computed(() =>
		resolveTriggerLabels(this.#translations())
	);
	readonly #isOptOut = computed(() => isOptOutTrigger(this.consent.snapshot()));
	/** @internal */
	protected readonly resolvedLabel = computed(
		() =>
			this.label() ??
			(this.#isOptOut()
				? resolveOptOutLink(
						this.#translations(),
						this.consent.presentation()?.optOutLink
					).label
				: this.labels().label)
	);

	/** @internal */
	protected readonly visible = computed(() =>
		isTriggerVisible({
			dialogOpen:
				this.consent.snapshot().activeUI === 'dialog' ||
				this.consent.optOutConfirmationOpen(),
			hasConsentPreferences: this.consent.hasConsentPreferences(),
			promptOwed: this.consent.promptRequirement().kind !== 'none',
			showWhen: this.showWhen(),
		})
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
	private readonly button = viewChild<ElementRef<HTMLButtonElement>>('button');

	/** @internal */
	protected readonly toolbarItems = computed<readonly TriggerToolbarItem[]>(
		() => (this.#devTools() ? toolbarOrder(this.corner()) : ['preferences'])
	);
	/** @internal */
	protected readonly focusedItem = signal<TriggerToolbarItem | undefined>(
		undefined
	);
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
		joinStyles(
			toStyleAttributeValue(this.toolbarStyle().style),
			this.#dragStyle()
		)
	);
	/** @internal */
	protected readonly buttonStyle = computed(() =>
		joinStyles(
			toStyleAttributeValue(this.triggerStyle().style),
			this.#dragStyle()
		)
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

		// Ends the snap once the new corner's transition has run.
		afterRenderEffect((onCleanup) => {
			if (!this.isSnapping()) {
				return;
			}
			const element =
				this.toolbar()?.nativeElement ?? this.button()?.nativeElement;
			if (!element) {
				this.isSnapping.set(false);
				return;
			}
			onCleanup(
				onSnapEnd(element, () => {
					this.isSnapping.set(false);
				})
			);
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

		inject(DestroyRef).onDestroy(() => this.#drag.pointerCancel());
	}

	/** @internal */
	protected styleOf(style: ClassNameStyle): string | null {
		return toStyleAttributeValue(style.style) ?? null;
	}

	/** @internal */
	protected warm(): void {
		warmDialog();
	}

	/** @internal */
	protected startDrag(event: PointerEvent): void {
		if (event.button === 0) {
			this.isSnapping.set(false);
		}
		this.#drag.pointerDown(event);
	}

	/** @internal */
	protected drag(event: PointerEvent): void {
		this.#drag.pointerMove(event);
	}

	/** @internal */
	protected endDrag(event: PointerEvent): void {
		this.#drag.pointerUp(event);
	}

	/** @internal */
	protected cancelDrag(): void {
		this.#drag.pointerCancel();
	}

	/** @internal */
	protected toggleDevTools(event: MouseEvent): void {
		if (this.#drag.endsDrag(event)) {
			return;
		}
		this.#devTools()?.toggle();
	}

	/** @internal */
	protected moveToolbarFocus(event: KeyboardEvent): void {
		const next = nextToolbarItem(
			this.toolbarItems(),
			this.tabStopItem(),
			event.key
		);
		if (!next) {
			return;
		}
		event.preventDefault();
		this.focusedItem.set(next);
		this.toolbar()
			?.nativeElement.querySelector<HTMLElement>(
				`[data-inth-trigger-item="${next}"]`
			)
			?.focus();
	}

	/** @internal */
	protected openDialog(event: MouseEvent): void {
		if (this.#drag.endsDrag(event)) {
			return;
		}
		this.triggerClick.emit(event);
		if (!event.defaultPrevented) {
			if (this.#isOptOut()) {
				void this.consent.requestOptOut();
			} else {
				this.consent.setActiveUI('dialog');
			}
		}
	}

	#resolve(
		key: Parameters<typeof resolveStyles>[0],
		baseClassName: ClassNameStyle['baseClassName'],
		className?: string
	): ClassNameStyle {
		const noStyle = this.#resolvedNoStyle();
		return resolveStyles(
			key,
			this.theme.theme(),
			{ baseClassName, className, noStyle },
			noStyle
		);
	}
}
