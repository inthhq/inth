import {
	ChangeDetectionStrategy,
	Component,
	signal,
	viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from './accordion';

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
	imports: [Accordion, AccordionItem, AccordionTrigger, AccordionContent],
	selector: 'test-accordion',
	template: `
		<div
			inthAccordion
			type="single"
			[collapsible]="true"
			[(value)]="value"
		>
			@for (item of ['a', 'b']; track item) {
				<div
					inthAccordionItem
					[value]="item"
				>
					<button
						inthAccordionTrigger
						[id]="'t-' + item"
					>
						{{ item }}
					</button>
					<section inthAccordionContent>{{ item }} body</section>
				</div>
			}
		</div>
	`,
})
class AccordionHost {
	readonly value = signal<string | string[] | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Accordion, AccordionItem, AccordionTrigger, AccordionContent],
	selector: 'test-disabled-accordion',
	template: `
		<div
			inthAccordion
			type="multiple"
			[(value)]="value"
		>
			<div
				inthAccordionItem
				value="a"
				[disabled]="true"
			>
				<button inthAccordionTrigger>A</button>
				<section inthAccordionContent>a body</section>
			</div>
		</div>
	`,
})
class DisabledAccordionHost {
	readonly value = signal<string | string[] | undefined>(undefined);
	readonly item = viewChild.required(AccordionItem);
	readonly accordion = viewChild.required(Accordion);
}

describe('inthAccordion', () => {
	test('opens one item at a time and links trigger and content', async () => {
		const { fixture, root } = await render(AccordionHost);
		const [first, second] = Array.from(
			root.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"]')
		);
		const [firstContent] = Array.from(
			root.querySelectorAll<HTMLElement>('[data-slot="accordion-content"]')
		);
		expect(first?.getAttribute('aria-expanded')).toBe('false');
		expect(first?.getAttribute('aria-controls')).toBe(firstContent?.id);
		expect(firstContent?.getAttribute('aria-labelledby')).toBe(first?.id);

		first?.click();
		await fixture.whenStable();
		expect(fixture.componentInstance.value()).toBe('a');
		expect(first?.getAttribute('data-state')).toBe('open');
		expect(firstContent?.getAttribute('aria-hidden')).toBe('false');

		second?.click();
		await fixture.whenStable();
		expect(first?.getAttribute('data-state')).toBe('closed');

		second?.click();
		await fixture.whenStable();
		expect(fixture.componentInstance.value()).toBeUndefined();
	});

	test('keeps focus out of a closed panel', async () => {
		const { fixture, root } = await render(AccordionHost);
		const [first] = Array.from(
			root.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"]')
		);
		const [firstContent] = Array.from(
			root.querySelectorAll<HTMLElement>('[data-slot="accordion-content"]')
		);
		expect(firstContent?.hasAttribute('inert')).toBe(true);

		first?.click();
		await fixture.whenStable();
		expect(firstContent?.hasAttribute('inert')).toBe(false);
	});

	test('toggle() leaves a disabled item as it is', async () => {
		const { fixture } = await render(DisabledAccordionHost);

		fixture.componentInstance.item().toggle();
		await fixture.whenStable();

		expect(fixture.componentInstance.value()).toBeUndefined();
		expect(fixture.componentInstance.item().open()).toBe(false);
	});

	test("the root's toggleItem() leaves a disabled item as it is", async () => {
		const { fixture } = await render(DisabledAccordionHost);

		fixture.componentInstance.accordion().toggleItem('a');
		await fixture.whenStable();

		expect(fixture.componentInstance.value()).toBeUndefined();
	});
});
