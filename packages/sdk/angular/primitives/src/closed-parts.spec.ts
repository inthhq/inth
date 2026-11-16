import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from './accordion';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from './collapsible';
import {
	Dialog,
	DialogBackdrop,
	DialogContent,
	DialogPositioner,
	DialogTitle,
} from './dialog';
import {
	PreferenceItem,
	PreferenceItemContent,
	PreferenceItemTrigger,
} from './preference-item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

// Each host starts open and closes through its signal, so a part that
// stays mounted after closing is checked as well as one mounted closed.
// The `data-inside` button stands for anything focusable in the part.

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		Dialog,
		DialogBackdrop,
		DialogContent,
		DialogPositioner,
		DialogTitle,
	],
	selector: 'test-dialog',
	template: `<ng-container
		c15tDialog
		#dialog="c15tDialog"
		[(open)]="open"
	>
		@if (dialog.shouldRender()) {
			<div c15tDialogBackdrop></div>
			<div c15tDialogPositioner>
				<div c15tDialogContent>
					<h2 c15tDialogTitle>Title</h2>
					<button
						type="button"
						data-inside
					>
						Inside
					</button>
				</div>
			</div>
		}
	</ng-container>`,
})
class DialogHost {
	readonly open = signal<unknown>(true);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Accordion, AccordionItem, AccordionTrigger, AccordionContent],
	selector: 'test-accordion',
	template: `<div
		c15tAccordion
		type="single"
		[collapsible]="true"
		[(value)]="open"
	>
		<div
			c15tAccordionItem
			value="a"
		>
			<button c15tAccordionTrigger>A</button>
			<section c15tAccordionContent>
				<button
					type="button"
					data-inside
				>
					Inside
				</button>
			</section>
		</div>
	</div>`,
})
class AccordionHost {
	readonly open = signal<unknown>('a');
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Collapsible, CollapsibleTrigger, CollapsibleContent],
	selector: 'test-collapsible',
	template: `<div
		c15tCollapsible
		[(open)]="open"
	>
		<button c15tCollapsibleTrigger>More</button>
		<div c15tCollapsibleContent>
			<button
				type="button"
				data-inside
			>
				Inside
			</button>
		</div>
	</div>`,
})
class CollapsibleHost {
	readonly open = signal<unknown>(true);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [PreferenceItem, PreferenceItemTrigger, PreferenceItemContent],
	selector: 'test-preference-item',
	template: `<div
		c15tPreferenceItem
		[(open)]="open"
	>
		<button c15tPreferenceItemTrigger>Analytics</button>
		<div c15t-preference-item-content>
			<button
				type="button"
				data-inside
			>
				Inside
			</button>
		</div>
	</div>`,
})
class PreferenceItemHost {
	readonly open = signal<unknown>(true);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Tabs, TabsList, TabsTrigger, TabsContent],
	selector: 'test-tabs',
	template: `<div
		c15tTabs
		[(value)]="open"
	>
		<div c15tTabsList>
			<button
				c15tTabsTrigger
				value="a"
			>
				A
			</button>
			<button
				c15tTabsTrigger
				value="other"
			>
				Other
			</button>
		</div>
		<div
			c15tTabsContent
			value="a"
		>
			<button
				type="button"
				data-inside
			>
				Inside
			</button>
		</div>
	</div>`,
})
class TabsHost {
	readonly open = signal<unknown>('a');
}

type Host = new () => { readonly open: WritableSignal<unknown> };

/** Name, host, and the value that closes it. */
const CLOSABLE: readonly [string, Host, unknown][] = [
	['dialog', DialogHost, false],
	['accordion', AccordionHost, undefined],
	['collapsible', CollapsibleHost, false],
	['preference item', PreferenceItemHost, false],
	['tabs', TabsHost, 'other'],
];

/** Out of the tab order and the accessibility tree. */
const concealed = (element: Element): boolean =>
	element.closest('[hidden]') !== null ||
	(element.closest('[inert]') !== null &&
		element.closest('[aria-hidden="true"]') !== null);

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
});

describe('a closed primitive', () => {
	test.each(CLOSABLE)(
		'the %s keeps its closed part out of reach',
		async (_name, host, closed) => {
			const fixture = TestBed.createComponent(host);
			document.body.append(fixture.nativeElement);
			await fixture.whenStable();
			const inside = () =>
				(fixture.nativeElement as HTMLElement).querySelector('[data-inside]');
			expect(inside()).not.toBeNull();
			expect(concealed(inside() as Element)).toBe(false);

			fixture.componentInstance.open.set(closed);
			await fixture.whenStable();
			const part = inside();
			// Unmounted is out of reach too.
			expect(part === null || concealed(part)).toBe(true);
		}
	);
});
