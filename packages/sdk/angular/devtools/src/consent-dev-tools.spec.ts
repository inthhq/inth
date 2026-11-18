import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager, provideC15t } from '@c15t/angular';
import type { AllConsentNames } from '@c15t/core';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CONSENT_ENGINE_MODULE } from '../../src/lib/core/consent-manager';
import type { DeferredRuntime } from '../../src/lib/core/deferred/deferred-runtime';
import { testing } from '../../testing/src/testing-mode';
import { ConsentDevTools, provideC15tDevTools } from './public-api';
import type { ConsentDevToolsOptions } from './public-api';

/** The panel roots, which live inside each host's shadow root. */
const mountedDevTools = (): HTMLElement[] =>
	[...document.querySelectorAll<HTMLElement>('[data-c15t-dev-tools-host]')]
		.map((host) =>
			host.shadowRoot?.querySelector<HTMLElement>('[data-c15t-dev-tools]')
		)
		.filter((root): root is HTMLElement => root !== null && root !== undefined);

/** `querySelector` across every mounted panel. */
const queryDevTools = <ElementType extends Element = HTMLElement>(
	selector: string
): ElementType | null => {
	for (const root of mountedDevTools()) {
		const found = root.matches(selector)
			? (root as unknown as ElementType)
			: root.querySelector<ElementType>(selector);
		if (found) {
			return found;
		}
	}
	return null;
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDevTools],
	selector: 'test-devtools-host',
	template: `
		<c15t-consent-dev-tools
			defaultOpen
			[clearRecords]="clearRecords()"
			[getConsentCategories]="getConsentCategories()"
			[position]="position()"
			[shadow]="shadow()"
		/>
	`,
})
class DevToolsHost {
	readonly clearRecords =
		signal<ConsentDevToolsOptions['clearRecords']>(undefined);
	readonly getConsentCategories =
		signal<ConsentDevToolsOptions['getConsentCategories']>(undefined);
	readonly position = signal<ConsentDevToolsOptions['position']>('top-left');
	readonly shadow = signal<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-empty-app',
	template: '',
})
class EmptyApp {}

const configure = (
	categories: AllConsentNames[] = ['measurement', 'marketing']
) =>
	TestBed.configureTestingModule({
		providers: [
			provideC15t({
				consentCategories: categories,
				mode: testing(),
				persistence: false,
			}),
		],
	});

const clickButton = (label: string) => {
	const button = [
		...(mountedDevTools()[0]?.querySelectorAll('button') ?? []),
	].find((element) => element.textContent === label);
	expect(button).toBeDefined();
	button?.click();
};

afterEach(() => {
	TestBed.resetTestingModule();
});

describe('@c15t/angular/devtools', () => {
	test('keeps a new clearRecords live without remounting, and unmounts with the component', async () => {
		configure();
		const fixture = TestBed.createComponent(DevToolsHost);
		const firstClear = vi.fn();
		const nextClear = vi.fn();
		fixture.componentInstance.clearRecords.set(firstClear);
		await fixture.whenStable();
		await vi.waitFor(() => expect(mountedDevTools()).toHaveLength(1));
		const [root] = mountedDevTools();

		fixture.componentInstance.clearRecords.set(nextClear);
		await fixture.whenStable();
		expect(mountedDevTools()[0]).toBe(root);
		root?.querySelector<HTMLButtonElement>('[data-tab="actions"]')?.click();
		clickButton('Clear stored records');
		expect(firstClear).not.toHaveBeenCalled();
		expect(nextClear).toHaveBeenCalledOnce();

		fixture.destroy();
		expect(mountedDevTools()).toHaveLength(0);
	});

	test('defaults clearRecords to the provider runtime', async () => {
		configure();
		const fixture = TestBed.createComponent(DevToolsHost);
		await fixture.whenStable();
		const consent = TestBed.inject(ConsentManager);
		const clear = vi.spyOn(consent, 'clearRecords');
		await vi.waitFor(() => expect(mountedDevTools()).toHaveLength(1));
		mountedDevTools()[0]
			?.querySelector<HTMLButtonElement>('[data-tab="actions"]')
			?.click();
		clickButton('Clear stored records');
		expect(clear).toHaveBeenCalledOnce();
	});

	test('remounts once for a new category scope or position', async () => {
		configure(['necessary', 'marketing', 'measurement']);
		const fixture = TestBed.createComponent(DevToolsHost);
		fixture.componentInstance.getConsentCategories.set(() => [
			'necessary',
			'marketing',
		]);
		await fixture.whenStable();
		await vi.waitFor(() =>
			expect(
				queryDevTools('[data-focus-key="consent:marketing"]')
			).not.toBeNull()
		);

		fixture.componentInstance.getConsentCategories.set(() => [
			'necessary',
			'measurement',
		]);
		fixture.componentInstance.position.set('bottom-left');
		await fixture.whenStable();
		await vi.waitFor(() => {
			expect(
				queryDevTools('[data-focus-key="consent:measurement"]')
			).not.toBeNull();
			expect(queryDevTools('[data-focus-key="consent:marketing"]')).toBeNull();
			expect(queryDevTools('.c15t-dev-tools--bottom-left')).not.toBeNull();
		});
		expect(mountedDevTools()).toHaveLength(1);
	});

	test('mounts in the light DOM when shadow is false', async () => {
		configure();
		const fixture = TestBed.createComponent(DevToolsHost);
		fixture.componentInstance.shadow.set(false);
		await fixture.whenStable();
		await vi.waitFor(() =>
			expect(
				document.body.querySelector('[data-c15t-dev-tools]')
			).not.toBeNull()
		);
		expect(document.querySelector('[data-c15t-dev-tools-host]')).toBeNull();
	});

	test('provideC15tDevTools mounts the panel with the application', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					mode: testing(),
					persistence: false,
				}),
				provideC15tDevTools({ position: 'bottom-right' }),
			],
		});
		const fixture = TestBed.createComponent(EmptyApp);
		await fixture.whenStable();
		await vi.waitFor(() =>
			expect(queryDevTools('.c15t-dev-tools--bottom-right')).not.toBeNull()
		);
		TestBed.resetTestingModule();
		expect(mountedDevTools()).toHaveLength(0);
	});

	test('lists the configured scripts, which register with the engine kernel', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					consentCategories: ['measurement'],
					mode: testing(),
					persistence: false,
					scripts: [
						{
							category: 'measurement',
							id: 'devtools-listed-script',
							src: 'data:text/javascript,void%200',
						},
					],
				}),
			],
		});
		const fixture = TestBed.createComponent(DevToolsHost);
		await fixture.whenStable();
		await vi.waitFor(() => expect(mountedDevTools()).toHaveLength(1));
		clickButton('Scripts');
		await vi.waitFor(() =>
			expect(mountedDevTools()[0]?.textContent).toContain(
				'devtools-listed-script'
			)
		);
	});

	test('moves to the engine kernel when a retry loads it', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {
			/* The failed load logs. */
		});
		let loads = 0;
		TestBed.configureTestingModule({
			providers: [
				provideC15t({
					consentCategories: ['measurement'],
					mode: testing(),
					persistence: false,
					scripts: [
						{
							category: 'measurement',
							id: 'devtools-retried-script',
							src: 'data:text/javascript,void%200',
						},
					],
				}),
				{
					provide: CONSENT_ENGINE_MODULE,
					useValue: () => {
						loads += 1;
						return loads === 1
							? Promise.reject(new Error('chunk failed'))
							: import('../../src/lib/core/deferred/engine');
					},
				},
			],
		});
		const fixture = TestBed.createComponent(DevToolsHost);
		await fixture.whenStable();
		// After the failed load the panel shows the stand-in's state.
		await vi.waitFor(() => expect(mountedDevTools()).toHaveLength(1));

		const consent = TestBed.inject(ConsentManager);
		(consent.runtime as DeferredRuntime).load();
		await vi.waitFor(() => expect(consent.ɵengine()).not.toBeNull());
		await fixture.whenStable();
		clickButton('Scripts');
		await vi.waitFor(() =>
			expect(mountedDevTools()[0]?.textContent).toContain(
				'devtools-retried-script'
			)
		);
		expect(mountedDevTools()).toHaveLength(1);
		error.mockRestore();
	});
});
