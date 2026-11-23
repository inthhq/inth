import {
	ChangeDetectionStrategy,
	Component,
	inject,
	signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testOptions } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import { provideInth } from '../../src/lib/core/provide-inth';
import { ConsentDialog } from './consent-dialog';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-dialog-focus',
	template: `<button
			type="button"
			data-testid="opener"
			(click)="consent.setActiveUI('dialog')"
		>
			Your Privacy Choices
		</button>
		<inth-consent-dialog />`,
})
class Host {
	protected readonly consent = inject(ConsentManager);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-controlled-focus',
	template: `<button
			type="button"
			data-testid="opener"
		>
			Preferences
		</button>
		<inth-consent-dialog [(open)]="open" />`,
})
class ControlledHost {
	readonly open = signal<boolean | undefined>(false);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-mounted-open',
	template: `<button
			type="button"
			data-testid="opener"
		>
			Preferences
		</button>
		@if (shown()) {
			<inth-consent-dialog
				[open]="true"
				(openChange)="shown.set($event)"
			/>
		}`,
})
class MountedOpenHost {
	readonly shown = signal(false);
}

const WAIT = { timeout: 5000 };

const byTestId = (id: string) =>
	document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

/**
 * The dialog always blocks the page and traps focus, whatever the
 * provider's `scrollLock` and `trapFocus` say: these tests cover where
 * focus goes when it opens and closes.
 */
describe("the consent dialog's focus", () => {
	test('takes focus when it opens, and gives it back when it closes', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
				}),
			],
		});
		const fixture = TestBed.createComponent(Host);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();
		opener.click();
		await vi.waitFor(async () => {
			await settle();
			const root = byTestId('consent-dialog-root');
			expect(root).not.toBeNull();
			expect(root?.contains(document.activeElement)).toBe(true);
		}, WAIT);

		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('consent-dialog-root')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);

	test('a dialog controlled through [(open)] gives focus back to its opener', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
				}),
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('consent-dialog-root')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		fixture.componentInstance.open.set(false);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('consent-dialog-root')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);

	test('stays open when the parent hands open back to the consent state, and gives focus back when it closes', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
				}),
			],
		});
		const fixture = TestBed.createComponent(ControlledHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.open.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('consent-dialog-root')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		// Control goes back to the consent state, which the parent's open
		// moved to the dialog: it stays open, and keeps focus.
		fixture.componentInstance.open.set(undefined);
		await settle();
		expect(TestBed.inject(ConsentManager).activeUI()).toBe('dialog');
		expect(
			byTestId('consent-dialog-root')?.contains(document.activeElement)
		).toBe(true);

		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('consent-dialog-root')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);

	test('a dialog mounted already open gives focus back to its opener', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					...testOptions(),
					disableAnimation: true,
				}),
			],
		});
		const fixture = TestBed.createComponent(MountedOpenHost);
		document.body.append(fixture.nativeElement);
		const settle = async (): Promise<void> => {
			await fixture.whenStable();
			await new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
			await fixture.whenStable();
		};
		await settle();
		const opener = byTestId('opener') as HTMLElement;
		opener.focus();

		fixture.componentInstance.shown.set(true);
		await vi.waitFor(async () => {
			await settle();
			expect(
				byTestId('consent-dialog-root')?.contains(document.activeElement)
			).toBe(true);
		}, WAIT);

		// Escape closes it: the parent removes it from the page.
		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await settle();
			expect(byTestId('consent-dialog-root')).toBeNull();
			expect(document.activeElement).toBe(opener);
		}, WAIT);
	}, 20_000);
});
