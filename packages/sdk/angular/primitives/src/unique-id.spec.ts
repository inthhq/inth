import {
	APP_ID,
	ChangeDetectionStrategy,
	Component,
	provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	bootstrapApplication,
	createApplication,
} from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from './collapsible';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [Collapsible, CollapsibleTrigger, CollapsibleContent],
	selector: 'app-root',
	template: `<div inthCollapsible>
			<button inthCollapsibleTrigger>More</button>
			<div inthCollapsibleContent>Body</div>
		</div>
		<div inthCollapsible>
			<button inthCollapsibleTrigger>Again</button>
			<div inthCollapsibleContent>Body</div>
		</div>`,
})
class App {}

/** Every `id` in the markup, in order. */
const idsIn = (html: string): string[] =>
	[...html.matchAll(/\sid="(?<id>[^"]+)"/gu)].map(
		(match) => match.groups?.id ?? ''
	);

const serverRender = (): Promise<string> =>
	renderApplication(
		(context) =>
			bootstrapApplication(
				App,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
					],
				},
				context
			),
		{
			document: '<html><head></head><body><app-root></app-root></body></html>',
			url: '/',
		}
	);

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('uniqueId', () => {
	test('gives every server render and the browser the same ids', async () => {
		const first = idsIn(await serverRender());
		const second = idsIn(await serverRender());
		expect(first.length).toBe(4);
		expect(second).toEqual(first);

		// TestBed sets its own APP_ID; an app's server and browser share one.
		TestBed.configureTestingModule({
			providers: [{ provide: APP_ID, useValue: 'ng' }],
		});
		const fixture = TestBed.createComponent(App);
		await fixture.whenStable();
		expect(idsIn((fixture.nativeElement as HTMLElement).innerHTML)).toEqual(
			first
		);
	});

	test('keeps the ids of two applications on one page apart', async () => {
		const mount = async (appId: string): Promise<string[]> => {
			const host = document.createElement('app-root');
			document.body.append(host);
			const app = await createApplication({
				providers: [
					provideZonelessChangeDetection(),
					{ provide: APP_ID, useValue: appId },
				],
			});
			app.bootstrap(App, host);
			await app.whenStable();
			const ids = idsIn(host.innerHTML);
			app.destroy();
			host.remove();
			return ids;
		};

		const first = await mount('shop');
		const second = await mount('account');

		expect(first).toHaveLength(4);
		expect(second.filter((id) => first.includes(id))).toEqual([]);
	});
});
