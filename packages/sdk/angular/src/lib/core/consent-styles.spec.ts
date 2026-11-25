import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { ConsentDialogTrigger } from '../../../consent-dialog-trigger/src/consent-dialog-trigger';
import { ConsentWidget } from '../../../consent-widget/src/consent-widget';
import { testOptions } from '../../__tests__/test-local';
import { ConsentBanner } from '../prompt/prompt';
import { ConsentManager } from './consent-manager';
import {
	ensureSurfaceStyles,
	STYLE_ATTRIBUTE,
	SURFACE_SCOPES,
} from './consent-styles';
import { provideInth } from './provide-inth';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-styled-banner',
	template: `<inth-consent-banner [noStyle]="false" />`,
})
class StyledBanner {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-default-banner',
	template: `<inth-consent-banner />`,
})
class DefaultBanner {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialogTrigger],
	selector: 'test-triggers',
	template: `<inth-consent-dialog-trigger
		[noStyle]="own"
		[persistPosition]="false"
	/>`,
})
class Trigger {
	own: boolean | undefined = undefined;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'test-default-widget',
	template: `<inth-consent-widget />`,
})
class DefaultWidget {}

const sheets = () =>
	document.head.querySelectorAll(`style[${STYLE_ATTRIBUTE}]`);

const render = async <ComponentType>(
	component: new () => ComponentType,
	setup?: (instance: ComponentType) => void
) => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({ ...testOptions(), disableAnimation: true, noStyle: true }),
		],
	});
	const fixture = TestBed.createComponent(component);
	setup?.(fixture.componentInstance);
	await fixture.whenStable();
	return fixture;
};

afterEach(() => {
	TestBed.resetTestingModule();
	for (const sheet of sheets()) {
		sheet.remove();
	}
});

describe('ConsentStyles', () => {
	test('a surface\'s [noStyle]="false" gets its sheets under a noStyle provider', async () => {
		await render(StyledBanner);
		expect(sheets().length).toBeGreaterThan(0);
	});

	test("a surface that follows the provider's noStyle gets none", async () => {
		await render(DefaultBanner);
		expect(sheets()).toHaveLength(0);
	});

	test('the trigger follows the same rule', async () => {
		await render(Trigger);
		expect(sheets()).toHaveLength(0);
		TestBed.resetTestingModule();

		await render(Trigger, (trigger) => {
			trigger.own = false;
		});
		expect(sheets().length).toBeGreaterThan(0);
	});

	test.each([
		['banner', DefaultBanner],
		['widget', DefaultWidget],
	] as const)(
		"the %s adds its sheets once the provider's noStyle turns off",
		async (_name, component) => {
			const fixture = await render(component as new () => unknown);
			expect(sheets()).toHaveLength(0);

			await TestBed.inject(ConsentManager).updateOptions({ noStyle: false });
			await fixture.whenStable();
			expect(sheets().length).toBeGreaterThan(0);
		}
	);

	describe('a sheet that is still loading', () => {
		/** The selectors the pending rules hide, as the page holds them now. */
		const hidden = (element: Element): boolean =>
			[...document.head.querySelectorAll('style[data-inth-pending]')].some(
				(style) => {
					const selector = /\{(?<selector>[^{}]+)\{opacity/u.exec(
						style.textContent ?? ''
					)?.groups?.selector;
					return selector !== undefined && element.matches(selector);
				}
			);
		const surfaces = () => {
			document.body.innerHTML =
				'<div data-testid="consent-banner-card"></div><button data-testid="consent-dialog-trigger"></button>';
			return {
				banner: document.querySelector('[data-testid="consent-banner-card"]'),
				trigger: document.querySelector(
					'[data-testid="consent-dialog-trigger"]'
				),
			} as { banner: Element; trigger: Element };
		};
		const never = () =>
			new Promise<string>(() => {
				/* The request hangs. */
			});

		test('hides only the surface that waits for it', async () => {
			const { banner, trigger } = surfaces();
			ensureSurfaceStyles(
				document,
				[
					{
						css: '',
						id: 'test-banner',
						load: () => Promise.resolve('.banner{}'),
					},
				],
				undefined,
				SURFACE_SCOPES.banner
			);
			await vi.waitFor(() => {
				expect(hidden(banner)).toBe(false);
			});

			ensureSurfaceStyles(
				document,
				[{ css: '', id: 'test-trigger', load: never }],
				undefined,
				SURFACE_SCOPES.trigger
			);
			expect(hidden(trigger)).toBe(true);
			expect(hidden(banner)).toBe(false);
		});

		test('shows the surface after a while when the request hangs', () => {
			vi.useFakeTimers();
			try {
				const { trigger } = surfaces();
				ensureSurfaceStyles(
					document,
					[{ css: '', id: 'test-hang', load: never }],
					undefined,
					SURFACE_SCOPES.trigger
				);
				expect(hidden(trigger)).toBe(true);

				vi.advanceTimersByTime(10_000);
				expect(hidden(trigger)).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
