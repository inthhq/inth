import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, test } from 'vite-plus/test';

import { ScrollLock } from './scroll-lock';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ScrollLock],
	selector: 'test-scroll-lock-host',
	template: '<div [inthScrollLock]="lock()"></div>',
})
class ScrollLockHost {
	readonly lock = signal(false);
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

test('inthScrollLock locks the document while on', async () => {
	const fixture = TestBed.createComponent(ScrollLockHost);
	await fixture.whenStable();
	const locked = () =>
		document.body.style.overflow === 'hidden' ||
		document.documentElement.style.overflow === 'hidden';
	expect(locked()).toBe(false);
	fixture.componentInstance.lock.set(true);
	await fixture.whenStable();
	expect(locked()).toBe(true);
	fixture.componentInstance.lock.set(false);
	await fixture.whenStable();
	expect(locked()).toBe(false);
});
