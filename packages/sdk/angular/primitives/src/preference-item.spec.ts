import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vitest';

import {
	PreferenceItem,
	PreferenceItemBody,
	PreferenceItemContent,
	PreferenceItemTrigger,
} from './preference-item';

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
	imports: [PreferenceItem, PreferenceItemTrigger, PreferenceItemContent],
	selector: 'test-preference-item',
	template: `
		<div
			c15tPreferenceItem
			class="mine"
			[(open)]="open"
		>
			<button c15tPreferenceItemTrigger>Analytics</button>
			<div c15t-preference-item-content>
				<span data-testid="body">Body</span>
			</div>
		</div>
		<div
			c15tPreferenceItem
			[noStyle]="true"
			data-testid="bare"
		></div>
	`,
})
class PreferenceItemHost {
	readonly open = signal(false);
}

describe('c15tPreferenceItem', () => {
	test('renders the content on first open and keeps it', async () => {
		const { fixture, get, root } = await render(PreferenceItemHost);
		const item = get('[data-slot="preference-item-root"]');
		expect(item.classList.contains('mine')).toBe(true);
		expect(item.classList.length).toBeGreaterThan(1);
		expect(get('[data-testid="bare"]').classList.length).toBe(0);

		const content = get('[data-slot="preference-item-content"]');
		expect(content.hasAttribute('inert')).toBe(true);
		expect(
			content.querySelector('[data-slot="preference-item-content-inner"]')
		).not.toBeNull();
		expect(root.querySelector('[data-testid="body"]')).toBeNull();

		get('[data-slot="preference-item-trigger"]').click();
		await fixture.whenStable();
		expect(content.getAttribute('aria-hidden')).toBe('false');
		expect(root.querySelector('[data-testid="body"]')).not.toBeNull();

		fixture.componentInstance.open.set(false);
		await fixture.whenStable();
		expect(root.querySelector('[data-testid="body"]')).not.toBeNull();
		expect(content.hasAttribute('inert')).toBe(true);
	});
});

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		PreferenceItemBody,
		PreferenceItem,
		PreferenceItemTrigger,
		PreferenceItemContent,
	],
	selector: 'test-preference-item-blocks',
	template: `
		<div
			c15tPreferenceItem
			[open]="true"
		>
			<button c15tPreferenceItemTrigger>Marketing</button>
			<div c15t-preference-item-content>
				Description
				@if (vendors()) {
					<section data-testid="vendors">Vendors</section>
				}
			</div>
		</div>
		<div
			c15tPreferenceItem
			[(open)]="lazyOpen"
		>
			<button c15tPreferenceItemTrigger>Lazy</button>
			<div c15t-preference-item-content>
				<ng-template c15tPreferenceItemBody>
					<span data-testid="lazy">Lazy body</span>
				</ng-template>
			</div>
		</div>
	`,
})
class PreferenceItemBlocksHost {
	readonly vendors = signal(false);
	readonly lazyOpen = signal(false);
}

describe('c15t-preference-item-content', () => {
	test('projects control flow in place, not as the lazy body template', async () => {
		const { fixture, get, root } = await render(PreferenceItemBlocksHost);
		const inner = get('[data-slot="preference-item-content-inner"]');
		expect(root.querySelectorAll('[data-testid="vendors"]')).toHaveLength(0);
		expect(inner.textContent?.trim()).toBe('Description');

		fixture.componentInstance.vendors.set(true);
		await fixture.whenStable();
		const vendors = root.querySelectorAll('[data-testid="vendors"]');
		expect(vendors).toHaveLength(1);
		// The description stays first, as the template writes it.
		expect(inner.textContent?.replace(/\s+/gu, ' ').trim()).toBe(
			'Description Vendors'
		);
	});

	test('creates a c15tPreferenceItemBody template from the first open', async () => {
		const { fixture, root } = await render(PreferenceItemBlocksHost);
		expect(root.querySelector('[data-testid="lazy"]')).toBeNull();
		fixture.componentInstance.lazyOpen.set(true);
		await fixture.whenStable();
		expect(root.querySelectorAll('[data-testid="lazy"]')).toHaveLength(1);
	});
});
