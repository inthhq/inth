import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { Dialog, DialogClose, DialogContent, DialogTitle } from './dialog';

const render = async <ComponentType>(type: new () => ComponentType) => {
	const fixture = TestBed.createComponent(type);
	document.body.append(fixture.nativeElement);
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	const get = (selector: string) => {
		const element = root.querySelector<HTMLElement>(selector);
		if (!element) {
			throw new Error(`Missing ${selector}`);
		}
		return element;
	};
	return { fixture, get, root };
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Dialog, DialogContent, DialogTitle, DialogClose],
	selector: 'test-dialog',
	template: `
		<button
			id="opener"
			type="button"
			(click)="open.set(true)"
		>
			Open
		</button>
		<ng-container
			inthDialog
			#dialog="inthDialog"
			[(open)]="open"
			[unmountOnExit]="true"
		>
			@if (dialog.shouldRender()) {
				<div inthDialogContent>
					<h2 inthDialogTitle>Title</h2>
					<button inthDialogClose>Close</button>
				</div>
			}
		</ng-container>
	`,
})
class DialogHost {
	readonly open = signal(false);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Dialog, DialogContent, DialogTitle, DialogClose],
	selector: 'test-open-dialog',
	template: `
		<ng-container
			inthDialog
			#dialog="inthDialog"
			[(open)]="open"
			[unmountOnExit]="true"
		>
			@if (dialog.shouldRender()) {
				<div inthDialogContent>
					<h2 inthDialogTitle>Title</h2>
					<button
						type="button"
						inthDialogClose
					>
						Close
					</button>
				</div>
			}
		</ng-container>
	`,
})
class OpenDialogHost {
	readonly open = signal(true);
}

describe('inthDialog', () => {
	test('labels the content, closes on Escape and restores focus', async () => {
		const { fixture, get, root } = await render(DialogHost);
		expect(root.querySelector('[role="dialog"]')).toBeNull();

		const opener = get('#opener');
		opener.focus();
		opener.click();
		await fixture.whenStable();
		const dialog = get('[role="dialog"]');
		expect(dialog.getAttribute('aria-labelledby')).toBe(
			get('[data-slot="dialog-title"]').id
		);
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		await fixture.whenStable();
		expect(dialog.contains(document.activeElement)).toBe(true);

		dialog.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await fixture.whenStable();
		expect(fixture.componentInstance.open()).toBe(false);
		expect(root.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	test('a dialog that mounts open returns focus when it closes', async () => {
		const outside = document.createElement('button');
		document.body.append(outside);
		outside.focus();
		const { fixture, get } = await render(OpenDialogHost);
		await fixture.whenStable();
		expect(get('[role="dialog"]').contains(document.activeElement)).toBe(true);

		get('[inthDialogClose]').click();
		await fixture.whenStable();
		expect(fixture.componentInstance.open()).toBe(false);
		expect(document.activeElement).toBe(outside);
	});
});
