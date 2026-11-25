import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from './collapsible';

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
	imports: [Collapsible, CollapsibleTrigger, CollapsibleContent],
	selector: 'test-collapsible',
	template: `
		<div
			inthCollapsible
			[(open)]="open"
		>
			<button inthCollapsibleTrigger>More</button>
			<div inthCollapsibleContent>Body</div>
		</div>
	`,
})
class CollapsibleHost {
	readonly open = signal(false);
}

describe('inthCollapsible', () => {
	test('keeps closed content inert and opens on click', async () => {
		const { fixture, get } = await render(CollapsibleHost);
		const content = get('[data-slot="collapsible-content"]');
		expect(content.hasAttribute('inert')).toBe(true);
		get('[data-slot="collapsible-trigger"]').click();
		await fixture.whenStable();
		expect(fixture.componentInstance.open()).toBe(true);
		expect(content.hasAttribute('inert')).toBe(false);
		expect(get('[data-slot="collapsible-root"]').dataset.state).toBe('open');
	});
});
