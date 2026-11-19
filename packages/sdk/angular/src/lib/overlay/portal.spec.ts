import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, test } from 'vitest';

import { Portal } from './portal';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Portal],
	selector: 'test-portal-host',
	template: `
		<div class="local">
			@if (shown()) {
				<div
					inthPortal
					data-testid="ported"
				>
					moved
				</div>
			}
		</div>
	`,
})
class PortalHost {
	readonly shown = signal(true);
}

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

test('inthPortal moves the element to the body and removes it with its view', async () => {
	const fixture = TestBed.createComponent(PortalHost);
	await fixture.whenStable();
	const ported = document.querySelector('[data-testid="ported"]');
	expect(ported?.parentElement).toBe(document.body);

	fixture.componentInstance.shown.set(false);
	await fixture.whenStable();
	expect(document.querySelector('[data-testid="ported"]')).toBeNull();
});
