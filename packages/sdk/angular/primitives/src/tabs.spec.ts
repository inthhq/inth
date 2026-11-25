import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

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
	imports: [Tabs, TabsList, TabsTrigger, TabsContent],
	selector: 'test-tabs',
	template: `
		<div
			inthTabs
			[(value)]="tab"
		>
			<div inthTabsList>
				<button
					inthTabsTrigger
					value="one"
				>
					One
				</button>
				<button
					inthTabsTrigger
					value="two"
				>
					Two
				</button>
			</div>
			<div
				inthTabsContent
				value="one"
			>
				First
			</div>
			<div
				inthTabsContent
				value="two"
			>
				Second
			</div>
		</div>
	`,
})
class TabsHost {
	readonly tab = signal<string | null>('one');
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Tabs, TabsList, TabsTrigger],
	selector: 'test-vertical-list',
	template: `
		<div
			inthTabs
			[(value)]="tab"
		>
			<div
				inthTabsList
				orientation="vertical"
			>
				<button
					inthTabsTrigger
					value="one"
				>
					One
				</button>
				<button
					inthTabsTrigger
					value="two"
				>
					Two
				</button>
			</div>
		</div>
	`,
})
class VerticalListHost {
	readonly tab = signal<string | null>('one');
}

describe('inthTabs', () => {
	test('selects with the arrow keys and moves focus', async () => {
		const { fixture, root } = await render(TabsHost);
		const [one, two] = Array.from(
			root.querySelectorAll<HTMLElement>('[role="tab"]')
		);
		const [first, second] = Array.from(
			root.querySelectorAll<HTMLElement>('[role="tabpanel"]')
		);
		expect(one?.getAttribute('aria-selected')).toBe('true');
		expect(one?.getAttribute('tabindex')).toBe('0');
		expect(two?.getAttribute('tabindex')).toBe('-1');
		expect(second?.hidden).toBe(true);
		expect(first?.getAttribute('aria-labelledby')).toBe(one?.id);

		one?.focus();
		one?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })
		);
		await fixture.whenStable();
		expect(fixture.componentInstance.tab()).toBe('two');
		expect(document.activeElement).toBe(two);
		expect(second?.hidden).toBe(false);
		expect(second?.dataset.state).toBe('active');
	});

	test("moves with the list's orientation, not the root's", async () => {
		const { fixture, get } = await render(VerticalListHost);
		expect(get('[role="tablist"]').getAttribute('aria-orientation')).toBe(
			'vertical'
		);
		const one = get('[role="tab"]');

		one.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })
		);
		await fixture.whenStable();
		expect(fixture.componentInstance.tab()).toBe('one');

		one.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })
		);
		await fixture.whenStable();
		expect(fixture.componentInstance.tab()).toBe('two');
	});
});
