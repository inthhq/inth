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
		inthDialog
		#dialog="inthDialog"
		[(open)]="open"
	>
		@if (dialog.shouldRender()) {
			<div inthDialogBackdrop></div>
			<div inthDialogPositioner>
				<div inthDialogContent>
					<h2 inthDialogTitle>Title</h2>
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
		inthAccordion
		type="single"
		[collapsible]="true"
		[(value)]="open"
	>
		<div
			inthAccordionItem
			value="a"
		>
			<button inthAccordionTrigger>A</button>
			<section inthAccordionContent>
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
		inthCollapsible
		[(open)]="open"
	>
		<button inthCollapsibleTrigger>More</button>
		<div inthCollapsibleContent>
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
		inthPreferenceItem
		[(open)]="open"
	>
		<button inthPreferenceItemTrigger>Analytics</button>
		<div inth-preference-item-content>
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
		inthTabs
		[(value)]="open"
	>
		<div inthTabsList>
			<button
				inthTabsTrigger
				value="a"
			>
				A
			</button>
			<button
				inthTabsTrigger
				value="other"
			>
				Other
			</button>
		</div>
		<div
			inthTabsContent
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
