import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	DestroyRef,
	Directive,
	DOCUMENT,
	effect,
	ElementRef,
	inject,
	PLATFORM_ID,
	untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { ActiveUI } from '@inth/sdk/engine';
import { findFocusRestoreEquivalent, firstTabbable } from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';

/**
 * Moves focus into a dialog: to its first tabbable element, else the
 * dialog itself. The same target a focus trap's `first-tabbable` uses, so
 * a trap never moves it a second time.
 *
 * @internal
 */
export const focusInitially = function focusInitially(node: HTMLElement): void {
	(firstTabbable(node) ?? node).focus();
};

/**
 * Moves focus into the host when it renders, unless focus is already in
 * it. For a dialog that does not trap focus: opening it removes the control
 * that opened it, which would leave focus on the page body.
 *
 * @internal
 */
@Directive({ selector: '[inthInitialFocus]' })
export class InitialFocus {
	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const document = inject(DOCUMENT);
		const node = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
		afterNextRender(() => {
			// After the render's own moves, such as a portal taking the dialog
			// to `<body>`: moving a focused node drops its focus.
			queueMicrotask(() => {
				if (node.isConnected && !node.contains(document.activeElement)) {
					focusInitially(node);
				}
			});
		});
	}
}

/**
 * Where focus returns after a dialog: the opener itself, or the element
 * that took its place. A banner's Customize button is gone while the
 * dialog is open, and the banner renders a new one when it comes back.
 */
const focusReturnTarget = function focusReturnTarget(
	opener: HTMLElement
): HTMLElement | null {
	return opener.isConnected ? opener : findFocusRestoreEquivalent(opener);
};

/**
 * Returns focus to the control that opened the dialog once it closes.
 *
 * A dialog follows `activeUI === 'dialog'` unless its parent sets `open`.
 * On that path the banner and the trigger that opened it unmount while it
 * is open, so the opener is read in the kernel's own notification, before
 * any of that renders. With `open` set, the opener is whatever had focus
 * when `open` turned `true`. Call it in an injection context.
 *
 * @param controlledOpen - The dialog's `open` input: `undefined` while the
 * consent state drives it.
 * @param onOpen - Called with the surface the dialog replaced, when the
 * consent state opens it.
 * @internal
 */
export const returnFocusAfterDialog = function returnFocusAfterDialog(
	controlledOpen: Signal<boolean | undefined>,
	onOpen?: (previous: ActiveUI) => void
): void {
	if (!isPlatformBrowser(inject(PLATFORM_ID))) {
		return;
	}
	const consent = inject(ConsentManager);
	const document = inject(DOCUMENT);
	let opener: HTMLElement | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastUI: ActiveUI = untracked(consent.activeUI);
	/** Focus left on the page body after the close goes back to `target`. */
	const restore = (target: HTMLElement): void => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const active = document.activeElement;
			if (
				active &&
				active !== document.body &&
				active !== document.documentElement
			) {
				return;
			}
			focusReturnTarget(target)?.focus({ preventScroll: true });
		}, 0);
	};
	const remember = (): void => {
		const active = document.activeElement;
		opener =
			active instanceof HTMLElement && active !== document.body ? active : null;
	};
	const onSurface = (ui: ActiveUI) => {
		if (untracked(controlledOpen) !== undefined) {
			// The parent owns visibility; the effect below follows it.
			lastUI = ui;
			return;
		}
		if (ui === lastUI) {
			return;
		}
		const previous = lastUI;
		lastUI = ui;
		if (ui === 'dialog') {
			onOpen?.(previous);
			remember();
			return;
		}
		if (previous !== 'dialog' || !opener) {
			return;
		}
		// Once the dialog has closed and the surface it replaced is back,
		// focus left on the page body returns to the opener, or to the
		// element that replaced it. Focus the dialog's own restore or the
		// visitor already placed elsewhere stays. After the dialog's own
		// restore, in a task of its own.
		const target = opener;
		opener = null;
		restore(target);
	};
	// A parent that owns `open`: its control keeps its place in the page.
	// Inputs are not set yet here, so a dialog mounted open is a change from
	// closed on the effect's first run, which records the opener.
	let wasOpen = false;
	const closed = (): void => {
		if (opener) {
			const target = opener;
			opener = null;
			restore(target);
		}
	};
	effect(() => {
		const open = controlledOpen();
		if (open === undefined) {
			// Control handed back while open: the consent state decides now.
			// Unless it has the dialog open, the dialog closed. When it does,
			// its own close gives focus back.
			if (wasOpen) {
				wasOpen = false;
				if (untracked(consent.activeUI) !== 'dialog') {
					untracked(closed);
				}
			}
			return;
		}
		if (open === wasOpen) {
			return;
		}
		wasOpen = open;
		untracked(() => {
			if (open) {
				remember();
			} else {
				closed();
			}
		});
	});
	effect((onCleanup) => {
		const kernel = consent.kernel();
		onCleanup(
			kernel.subscribe((snapshot) => {
				onSurface((snapshot.activeUI ?? 'none') as ActiveUI);
			})
		);
	});
	inject(DestroyRef).onDestroy(() => {
		clearTimeout(timer);
		// Removed while open, as a parent's `@if` around a dialog it mounted
		// open does: the opener still gets focus back.
		if (opener) {
			const target = opener;
			opener = null;
			setTimeout(() => {
				const active = document.activeElement;
				if (
					!active ||
					active === document.body ||
					active === document.documentElement
				) {
					focusReturnTarget(target)?.focus({ preventScroll: true });
				}
			}, 0);
		}
	});
};
