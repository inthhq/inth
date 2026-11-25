import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { ConsentDialogTrigger } from '../../../consent-dialog-trigger/src/consent-dialog-trigger';
import { ConsentDialog } from '../../../consent-dialog/src/consent-dialog';
import { ConsentGate } from '../../../consent-gate/src/consent-gate';
import { ConsentWidget } from '../../../consent-widget/src/consent-widget';
import { IABConsentBanner } from '../../../iab/src/iab-consent-banner';
import { IABConsentDialog } from '../../../iab/src/iab-consent-dialog';
import { iabTestOptions } from '../../../testing/src/__tests__/harness-test-bed';
import { testOptions } from '../../__tests__/test-local';
import { ConsentBanner } from '../prompt/prompt';
import type { InthProviderOptions } from './inth-options';
import { provideInth } from './provide-inth';

const LEGAL_LINKS = {
	privacyPolicy: { href: '/privacy' },
	termsOfService: { href: '/terms' },
};

// Each host renders one surface with every part that takes stock classes
// in view: the overlay, branding, legal links and buttons.
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-banner',
	template: `<inth-consent-banner
		[noStyle]="own()"
		[scrollLock]="true"
	/>`,
})
class BannerHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-dialog',
	template: `<inth-consent-dialog
		[noStyle]="own()"
		[open]="true"
	/>`,
})
class DialogHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'test-widget',
	template: `<inth-consent-widget [noStyle]="own()" />`,
})
class WidgetHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialogTrigger],
	selector: 'test-trigger',
	template: `<inth-consent-dialog-trigger
		[noStyle]="own()"
		[persistPosition]="false"
	/>`,
})
class TriggerHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentGate],
	selector: 'test-gate',
	template: `<inth-consent-gate
		category="measurement"
		[noStyle]="own()"
	>
		<iframe title="video"></iframe>
	</inth-consent-gate>`,
})
class GateHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentBanner],
	selector: 'test-iab-banner',
	template: `<inth-iab-consent-banner
		[noStyle]="own()"
		[scrollLock]="true"
	/>`,
})
class IABBannerHost {
	readonly own = input<boolean | undefined>(undefined);
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [IABConsentDialog],
	selector: 'test-iab-dialog',
	template: `<inth-iab-consent-dialog
		[noStyle]="own()"
		[open]="true"
	/>`,
})
class IABDialogHost {
	readonly own = input<boolean | undefined>(undefined);
}

type Host = new () => unknown;

/** Name, host, the test id that shows it rendered, extra provider options. */
type Surface = readonly [string, Host, string, Partial<InthProviderOptions>];

const SURFACES: readonly Surface[] = [
	['banner', BannerHost, 'consent-banner-card', {}],
	['dialog', DialogHost, 'consent-dialog-card', {}],
	['widget', WidgetHost, 'consent-widget-footer-save-button', {}],
	['trigger', TriggerHost, 'consent-dialog-trigger', {}],
	['gate', GateHost, 'consent-gate-placeholder', {}],
	['IAB banner', IABBannerHost, 'iab-consent-banner-card', iabTestOptions()],
	['IAB dialog', IABDialogHost, 'iab-consent-dialog-card', iabTestOptions()],
];

const STOCK_CLASS = /^inth-ui-/u;

/**
 * The branding wordmark inside the tag keeps its own classes under
 * `noStyle`, as React's `Branding` does, and so does the prompt's page
 * status region, which React's prompt keeps visually hidden either way, so
 * the comparison skips both.
 */
const WORDMARK =
	'[data-slot="tag-content"] *,[data-testid="consent-banner-announcement"]';

/** Every element that carries a stock class, by test id or tag, sorted. */
const styledElements = (): string[] =>
	[...document.body.querySelectorAll('*')]
		.filter(
			(element) =>
				!element.matches(WORDMARK) &&
				[...element.classList].some((name) => STOCK_CLASS.test(name))
		)
		.map(
			(element) =>
				element.getAttribute('data-testid') ?? element.tagName.toLowerCase()
		)
		.sort();

const reset = (): void => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
};

const render = async (
	[, host, ready, options]: Surface,
	own: boolean | undefined,
	providerNoStyle: boolean
): Promise<string[]> => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				...testOptions(),
				disableAnimation: true,
				legalLinks: LEGAL_LINKS,
				noStyle: providerNoStyle,
				...options,
			} as InthProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(host);
	fixture.componentRef.setInput('own', own);
	await vi.waitFor(
		async () => {
			await fixture.whenStable();
			expect(document.querySelector(`[data-testid="${ready}"]`)).not.toBeNull();
		},
		{ timeout: 5000 }
	);
	await fixture.whenStable();
	const styled = styledElements();
	reset();
	return styled;
};

afterEach(reset);

describe("a surface's [noStyle] reaches every part it renders", () => {
	test.each(SURFACES)(
		'the %s drops every stock class under a styled provider',
		async (...surface) => {
			expect((await render(surface, undefined, false)).length).toBeGreaterThan(
				0
			);

			expect(await render(surface, true, false)).toEqual([]);
		}
	);

	test.each(SURFACES)(
		'the %s keeps every stock class under a noStyle provider',
		async (...surface) => {
			const baseline = await render(surface, undefined, false);

			expect(await render(surface, false, true)).toEqual(baseline);
		}
	);
});
