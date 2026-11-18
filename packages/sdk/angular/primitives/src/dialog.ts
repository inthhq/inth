import { isPlatformBrowser } from '@angular/common';
import {
	computed,
	Directive,
	DOCUMENT,
	effect,
	ElementRef,
	inject,
	input,
	model,
	PLATFORM_ID,
} from '@angular/core';
import { ɵfocusInitially as focusInitially } from '@inth/angular';
import { getDialogState, isDialogDismissKey } from '@inth/sdk/ui/primitives';
import { setupFocusTrap, setupScrollLock } from '@inth/sdk/ui/utils';

import { uniqueId } from './unique-id';

/** Why a dialog asked to close. */
export type DialogCloseReason = 'backdrop' | 'close-trigger' | 'escape';

/**
 * A headless dialog's state. Put it on an `<ng-container>` or a wrapper
 * element and bind `[(open)]`.
 *
 * The parts are attribute directives on your own elements. Render them
 * while `shouldRender()` is `true`: always with the defaults, from the first
 * open with `lazyMount`, and only while open with `unmountOnExit`. It
 * returns focus to the element that had it when the dialog closes.
 *
 * @example
 * ```html
 * <ng-container inthDialog #dialog="inthDialog" [(open)]="open" [preventScroll]="true">
 *   @if (dialog.shouldRender()) {
 *     <div inthPortal>
 *       <div inthDialogBackdrop></div>
 *       <div inthDialogPositioner>
 *         <div inthDialogContent>
 *           <h2 inthDialogTitle>Privacy settings</h2>
 *           <p inthDialogDescription>Choose what we may use.</p>
 *           <button inthDialogClose>Close</button>
 *         </div>
 *       </div>
 *     </div>
 *   }
 * </ng-container>
 * ```
 */
@Directive({ exportAs: 'inthDialog', selector: '[inthDialog]' })
export class Dialog {
	/** Whether the dialog is open. */
	readonly open = model(false);
	/** Whether Escape closes it. */
	readonly closeOnEscape = input(true);
	/** Whether a backdrop click closes it. */
	readonly closeOnInteractOutside = input(true);
	/** Render the parts only from the first open. */
	readonly lazyMount = input(false);
	/** Lock page scrolling while open. */
	readonly preventScroll = input(false);
	/** Trap focus in the content while open. */
	readonly trapFocus = input(true);
	/** Render the parts only while open. */
	readonly unmountOnExit = input(false);

	/** @internal */
	readonly contentId = uniqueId('inth-dialog-content');
	/** @internal */
	readonly titleId = uniqueId('inth-dialog-title');
	/** @internal */
	readonly descriptionId = uniqueId('inth-dialog-description');

	#hasOpened = false;

	/** Whether the parts should be in the DOM. */
	readonly shouldRender = computed(() => {
		const open = this.open();
		if (open) {
			this.#hasOpened = true;
		}
		return (
			open || (!this.unmountOnExit() && (!this.lazyMount() || this.#hasOpened))
		);
	});

	/** @internal */
	readonly dataState = computed(() => getDialogState(this.open()));

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const document = inject(DOCUMENT);
		// Start closed, not from `open`, which has no bound value yet: a
		// dialog that mounts open still records the focus to return to.
		let lastOpen = false;
		let restoreFocus: HTMLElement | null = null;
		effect(() => {
			const open = this.open();
			if (open && !lastOpen) {
				restoreFocus = document.activeElement as HTMLElement | null;
			}
			if (
				!open &&
				lastOpen &&
				restoreFocus &&
				restoreFocus !== document.body &&
				restoreFocus !== document.documentElement
			) {
				restoreFocus.focus();
			}
			lastOpen = open;
		});
	}

	/**
	 * Close the dialog for a reason, unless the options forbid that reason.
	 *
	 * @param reason - What asked it to close.
	 */
	requestClose(reason: DialogCloseReason): void {
		if (reason === 'escape' && !this.closeOnEscape()) {
			return;
		}
		if (reason === 'backdrop' && !this.closeOnInteractOutside()) {
			return;
		}
		this.open.set(false);
	}
}

/** The overlay behind the dialog. A click on it closes the dialog. */
@Directive({
	host: {
		'(click)': 'dialog.requestClose("backdrop")',
		'[attr.data-state]': 'dialog.dataState()',
		'aria-hidden': 'true',
		'data-slot': 'dialog-backdrop',
		role: 'presentation',
	},
	selector: '[inthDialogBackdrop]',
})
export class DialogBackdrop {
	/** @internal */
	protected readonly dialog = inject(Dialog);
}

/** The element that positions the content. */
@Directive({
	host: {
		'[attr.data-state]': 'dialog.dataState()',
		'data-slot': 'dialog-positioner',
	},
	selector: '[inthDialogPositioner]',
})
export class DialogPositioner {
	/** @internal */
	protected readonly dialog = inject(Dialog);
}

/**
 * The dialog itself: `role="dialog"`, labelled by its title and described
 * by its description. Escape closes it. While open it takes focus (an
 * element marked `data-inth-dialog-focus="true"`, else the first tabbable
 * one), traps it with `trapFocus`, and locks scrolling with `preventScroll`.
 * A closed dialog that stays mounted is `inert` and `aria-hidden`.
 */
@Directive({
	host: {
		'(keydown)': 'dismissOnEscape($event)',
		'[attr.aria-describedby]': 'dialog.descriptionId',
		'[attr.aria-hidden]': 'dialog.open() ? null : "true"',
		'[attr.aria-labelledby]': 'dialog.titleId',
		'[attr.aria-modal]': 'dialog.trapFocus() ? "true" : null',
		'[attr.data-state]': 'dialog.dataState()',
		'[attr.inert]': 'dialog.open() ? null : ""',
		'[id]': 'dialog.contentId',
		'data-slot': 'dialog-content',
		role: 'dialog',
		tabindex: '-1',
	},
	selector: '[inthDialogContent]',
})
export class DialogContent {
	/** @internal */
	protected readonly dialog = inject(Dialog);

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const document = inject(DOCUMENT);
		const node = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
		effect((onCleanup) => {
			if (!this.dialog.open()) {
				return;
			}
			let active = true;
			onCleanup(() => {
				active = false;
			});
			queueMicrotask(() => {
				const { activeElement } = document;
				if (active && (!activeElement || !node.contains(activeElement))) {
					// Same target as the trap's `first-tabbable`, so the trap never
					// has to move focus a second time.
					focusInitially(node);
				}
			});
		});
		effect((onCleanup) => {
			if (this.dialog.open() && this.dialog.trapFocus()) {
				onCleanup(setupFocusTrap(node, { initialFocus: 'first-tabbable' }));
			}
		});
		effect((onCleanup) => {
			if (this.dialog.open() && this.dialog.preventScroll()) {
				onCleanup(setupScrollLock());
			}
		});
	}

	/** @internal */
	protected dismissOnEscape(event: KeyboardEvent): void {
		if (isDialogDismissKey(event.key)) {
			event.preventDefault();
			this.dialog.requestClose('escape');
		}
	}
}

/** The dialog's title. Put it on an `<h2>`. */
@Directive({
	host: { '[id]': 'dialog.titleId', 'data-slot': 'dialog-title' },
	selector: '[inthDialogTitle]',
})
export class DialogTitle {
	/** @internal */
	protected readonly dialog = inject(Dialog);
}

/** The dialog's description. Put it on a `<p>`. */
@Directive({
	host: { '[id]': 'dialog.descriptionId', 'data-slot': 'dialog-description' },
	selector: '[inthDialogDescription]',
})
export class DialogDescription {
	/** @internal */
	protected readonly dialog = inject(Dialog);
}

/** A `<button>` that closes the dialog. */
@Directive({
	host: {
		'(click)': 'close()',
		'[attr.data-disabled]': 'disabled() ? "" : null',
		'[attr.data-state]': 'dialog.dataState()',
		'[attr.disabled]': 'disabled() ? "" : null',
		'[attr.type]': 'type()',
		'data-slot': 'dialog-close',
	},
	selector: '[inthDialogClose]',
})
export class DialogClose {
	/** @internal */
	protected readonly dialog = inject(Dialog);
	/** Whether the button ignores clicks. */
	readonly disabled = input(false);
	/** The button's `type`. */
	readonly type = input<'button' | 'submit' | 'reset'>('button');

	/** @internal */
	protected close(): void {
		if (!this.disabled()) {
			this.dialog.requestClose('close-trigger');
		}
	}
}
