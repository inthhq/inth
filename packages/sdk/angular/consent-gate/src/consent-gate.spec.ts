import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
import { TEST_OPT_IN_RULE, testOptions } from '../../src/__tests__/test-local';
import { ConsentManager } from '../../src/lib/core/consent-manager';
import type {
	InthOptions,
	InthProviderOptions,
} from '../../src/lib/core/options';
import { provideInth } from '../../src/lib/core/provide-inth';
import {
	ConsentGate,
	ConsentGateContent,
	ConsentGatePlaceholder,
} from './consent-gate';

/** Counts how many times the gated content was created and destroyed. */
const lifecycle = { created: 0, destroyed: 0 };

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-gated-widget',
	template: '<span data-testid="widget">widget</span>',
})
class GatedWidget {
	constructor() {
		lifecycle.created += 1;
		inject(DestroyRef).onDestroy(() => {
			lifecycle.destroyed += 1;
		});
	}
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentGate],
	selector: 'test-stock-gate',
	template: `
		<inth-consent-gate
			category="measurement"
			class="video"
		>
			<iframe
				title="video"
				data-testid="video"
			></iframe>
		</inth-consent-gate>
	`,
})
class StockGate {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		ConsentGate,
		ConsentGateContent,
		ConsentGatePlaceholder,
		GatedWidget,
	],
	selector: 'test-template-gate',
	template: `
		<inth-consent-gate
			category="marketing"
			[vendor]="vendor()"
		>
			<ng-template inthConsentGateContent><test-gated-widget /></ng-template>
			<ng-template
				inthConsentGatePlaceholder
				let-category
				let-open="openDialog"
			>
				<button
					type="button"
					data-testid="custom"
					(click)="open()"
				>
					Allow {{ category }}
				</button>
			</ng-template>
		</inth-consent-gate>
	`,
})
class TemplateGate {
	readonly vendor = signal<string | undefined>(undefined);
}

const testId = (root: HTMLElement, id: string) =>
	root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const boot = async <ComponentType>(
	component: new () => ComponentType,
	options: Partial<InthOptions> = {}
) => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({ ...testOptions(), ...options } as InthProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(component);
	const consent = TestBed.inject(ConsentManager);
	await vi.waitFor(() => expect(consent.hasPolicy()).toBe(true));
	// Rendered, then one frame later the gate fills its wrapper.
	await vi.waitFor(async () => {
		await fixture.whenStable();
		expect(
			(fixture.nativeElement as HTMLElement).querySelector('inth-consent-gate')
				?.childElementCount
		).toBeGreaterThan(0);
	});
	const root = fixture.nativeElement as HTMLElement;
	const settle = async () => {
		await fixture.whenStable();
	};
	return { consent, fixture, root, settle };
};

afterEach(() => {
	TestBed.resetTestingModule();
	lifecycle.created = 0;
	lifecycle.destroyed = 0;
	document.head
		.querySelectorAll('style[data-inth-styles]')
		.forEach((element) => element.remove());
});

describe('ConsentGate', () => {
	test('shows the stock placeholder, whose button opens the dialog', async () => {
		const { consent, root, settle } = await boot(StockGate);
		expect(testId(root, 'video')).toBeNull();
		expect(testId(root, 'consent-gate-title')?.textContent?.trim()).toBe(
			'Accept Analytics consent to view this content.'
		);
		const button = testId(root, 'consent-gate-button');
		expect(button?.textContent?.trim()).toBe('Enable Analytics consent');
		expect(
			document.head.querySelector('style[data-inth-styles]')
		).not.toBeNull();

		button?.click();
		await settle();
		expect(consent.activeUI()).toBe('dialog');
	});

	test('mounts the content on a grant and removes it on withdrawal', async () => {
		const { consent, root, settle } = await boot(StockGate);
		await consent.saveConsents('all');
		await settle();
		expect(testId(root, 'video')).not.toBeNull();
		expect(testId(root, 'consent-gate-placeholder')).toBeNull();
		// The host is the wrapper and keeps the class in every state.
		expect(root.querySelector('inth-consent-gate')?.classList).toContain(
			'video'
		);

		await consent.saveConsents('necessary');
		await settle();
		expect(testId(root, 'video')).toBeNull();
		expect(testId(root, 'consent-gate-placeholder')).not.toBeNull();
	});

	test('creates template content only while allowed, and uses the custom placeholder', async () => {
		const { consent, root, settle } = await boot(TemplateGate);
		expect(lifecycle.created).toBe(0);
		expect(testId(root, 'consent-gate-placeholder')).toBeNull();
		const custom = testId(root, 'custom');
		expect(custom?.textContent?.trim()).toBe('Allow marketing');
		// A custom placeholder brings its own look: no stock sheets.
		expect(document.head.querySelector('style[data-inth-styles]')).toBeNull();

		custom?.click();
		await settle();
		expect(consent.activeUI()).toBe('dialog');

		await consent.saveConsents('all');
		await settle();
		expect(testId(root, 'widget')).not.toBeNull();
		expect(lifecycle.created).toBe(1);

		await consent.saveConsents('necessary');
		await settle();
		expect(testId(root, 'widget')).toBeNull();
		expect(lifecycle.destroyed).toBe(1);
	});

	test('a vendor the visitor turned off keeps the content out', async () => {
		const { consent, fixture, root, settle } = await boot(TemplateGate, {
			vendors: [
				{
					category: 'marketing',
					id: 'video-host',
					name: 'Video host',
					privacyPolicyUrl: 'https://video.example/privacy',
				},
			],
		});
		fixture.componentInstance.vendor.set('video-host');
		await consent.saveConsents('all');
		await settle();
		expect(testId(root, 'widget')).not.toBeNull();

		await consent.kernel().commands.save({ vendors: { 'video-host': false } });
		await settle();
		expect(testId(root, 'widget')).toBeNull();
		expect(testId(root, 'custom')).not.toBeNull();
	});

	test('consentGateButton styles merge over buttonPrimary', async () => {
		const { root } = await boot(StockGate, {
			theme: {
				slots: {
					buttonPrimary: { className: 'primary', style: { color: 'red' } },
					consentGate: 'brand-gate',
					consentGateButton: {
						className: 'gate-button',
						style: { padding: '3px' },
					},
				},
			},
		});
		expect(testId(root, 'consent-gate-placeholder')?.classList).toContain(
			'brand-gate'
		);
		const button = testId(root, 'consent-gate-button');
		expect(button?.classList).toContain('primary');
		expect(button?.classList).toContain('gate-button');
		expect(button?.style.color).toBe('red');
		expect(button?.style.padding).toBe('3px');
	});

	test('noStyle drops the stock classes and sheets', async () => {
		const { root } = await boot(StockGate, { noStyle: true });
		expect(testId(root, 'consent-gate-placeholder')?.className).toBe('');
		expect(testId(root, 'consent-gate-button')?.className).toBe('');
		expect(document.head.querySelector('style[data-inth-styles]')).toBeNull();
	});

	test('a strict policy that leaves the category out offers no button', async () => {
		const { root } = await boot(StockGate, {
			mode: offlineMode([
				{
					...TEST_OPT_IN_RULE,
					categories: ['marketing'],
					scopeMode: 'strict',
				},
			]),
		});
		expect(testId(root, 'consent-gate-title')?.textContent?.trim()).toBe(
			"This content is unavailable under your region's consent policy."
		);
		expect(testId(root, 'consent-gate-button')).toBeNull();
	});
});
