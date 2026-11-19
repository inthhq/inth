import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, test } from 'vitest';

import { FocusTrap } from './focus-trap';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [FocusTrap],
	selector: 'test-focus-trap-host',
	template: `
		<div
			[inthFocusTrap]="trap()"
			data-testid="trap"
		>
			<button
				type="button"
				data-testid="first"
			>
				first
			</button>
			<button
				type="button"
				data-testid="last"
			>
				last
			</button>
		</div>
	`,
})
class FocusTrapHost {
	readonly trap = signal(false);
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

test('inthFocusTrap keeps Tab inside the element while on', async () => {
	const fixture = TestBed.createComponent(FocusTrapHost);
	document.body.append(fixture.nativeElement);
	fixture.componentInstance.trap.set(true);
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	const last = root.querySelector<HTMLElement>('[data-testid="last"]');
	last?.focus();
	last?.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })
	);
	expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
});
