import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import {
	ConsentManager,
	ɵresolvedTranslations as resolvedTranslations,
	ɵresolveNoStyle as resolveNoStyle,
} from '@inth/angular';
import {
	PreferenceItemContent,
	PreferenceItem,
	PreferenceItemLeading,
	PreferenceItemTrigger,
	SwitchControl,
	Switch,
	SwitchThumb,
	uniqueId,
} from '@inth/angular/primitives';
import type { AllConsentNames, ResolvedVendor } from '@inth/sdk/engine';
import switchStyles from '@inth/sdk/ui/styles/components/switch';
import vendorListStyles from '@inth/sdk/ui/styles/components/vendor-list';

const DEFAULT_COPY = {
	disabledByCategory: 'Turn on this category to choose vendors.',
	privacyPolicy: 'Privacy policy',
	switchLabel: 'Allow {vendor}',
	title: 'Vendors ({count})',
};

/**
 * Vendor cards nested inside one category's accordion content. Each is a
 * collapsed card of its own that opens for its description and privacy
 * policy link, with a switch on the header. The host is the `<section>`;
 * render it only while the category lists vendors
 * (`ConsentManager.getDisplayedVendors(category).length > 0`).
 *
 * The markup, class names, `data-slot`s and ARIA attributes match the other
 * Inth frameworks' vendor lists.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-label]': 'title()',
		'[attr.data-testid]': '"consent-widget-vendor-list-" + category()',
		'[class]': "styles()?.root ?? ''",
	},
	imports: [
		PreferenceItemContent,
		PreferenceItem,
		PreferenceItemLeading,
		PreferenceItemTrigger,
		SwitchControl,
		Switch,
		SwitchThumb,
	],
	selector: 'section[inth-consent-vendor-list]',
	template: `@if (!categoryOn()) {
			<p
				[class]="styles()?.hint ?? ''"
				[attr.data-testid]="'consent-widget-vendor-hint-' + category()"
			>
				{{ copy().disabledByCategory }}
			</p>
		}
		@for (vendor of vendors(); track vendor.id) {
			@let open = openItems().has(vendor.id);
			@let details = hasDetails(vendor);
			@let checked = isChecked(vendor);
			<div
				inthPreferenceItem
				[class]="styles()?.item ?? ''"
				[disabled]="!details"
				[noStyle]="resolvedNoStyle()"
				[open]="open"
				[attr.data-testid]="
					'consent-widget-vendor-item-' + category() + '-' + vendor.id
				"
			>
				<div [class]="styles()?.header ?? ''">
					<button
						inthPreferenceItemTrigger
						[class]="styles()?.trigger ?? ''"
						(click)="toggleOpen(vendor.id)"
						[attr.data-testid]="
							'consent-widget-vendor-trigger-' + category() + '-' + vendor.id
						"
					>
						<div
							inthPreferenceItemLeading
							[class]="styles()?.arrow ?? ''"
						>
							<svg
								aria-hidden="true"
								fill="none"
								focusable="false"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								viewBox="0 0 24 24"
							>
								<title>{{ open ? 'Close' : 'Open' }}</title>
								@if (open) {
									<path d="M5 12h14" />
								} @else {
									<path d="M5 12h14M12 5v14" />
								}
							</svg>
						</div>
						<span
							[id]="labelId(vendor)"
							[class]="styles()?.name ?? ''"
							[attr.data-testid]="
								'consent-widget-vendor-name-' + category() + '-' + vendor.id
							"
						>
							{{ vendorName(vendor) }}
						</span>
					</button>
					@if (vendor.disabled !== true) {
						<div [class]="styles()?.control ?? ''">
							<button
								inthSwitch
								[attr.aria-label]="switchLabel(vendor)"
								[attr.aria-describedby]="labelId(vendor)"
								[checked]="checked"
								(checkedChange)="setVendor(vendor.id, $event)"
								[class]="resolvedNoStyle() ? '' : switchClasses.root"
								[attr.data-size]="resolvedNoStyle() ? null : 'small'"
								[disabled]="!categoryOn()"
								[attr.data-testid]="
									'consent-widget-vendor-switch-' + category() + '-' + vendor.id
								"
							>
								<span
									inthSwitchControl
									[class]="resolvedNoStyle() ? '' : switchClasses.track"
								>
									<span
										inthSwitchThumb
										[class]="resolvedNoStyle() ? '' : switchClasses.thumb"
									></span>
								</span>
							</button>
						</div>
					}
				</div>
				@if (details) {
					<div
						inth-preference-item-content
						[class]="styles()?.content ?? ''"
						[innerClassName]="styles()?.contentInner"
						[noStyle]="resolvedNoStyle()"
						[attr.data-testid]="
							'consent-widget-vendor-content-' + category() + '-' + vendor.id
						"
					>
						@if (vendor.description) {
							<p [class]="styles()?.description ?? ''">
								{{ vendor.description }}
							</p>
						}
						@if (vendor.privacyPolicyUrl) {
							<a
								[class]="styles()?.link ?? ''"
								[href]="vendor.privacyPolicyUrl"
								rel="noopener noreferrer"
								target="_blank"
							>
								{{ copy().privacyPolicy }}
							</a>
						}
					</div>
				}
			</div>
		}`,
})
export class ConsentVendorList {
	readonly #consent = inject(ConsentManager);
	readonly #uid = uniqueId('inth-vendor-list');

	/** The category whose vendors to list. */
	readonly category = input.required<AllConsentNames>();
	/** Drop the stock classes. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);

	readonly #translations = resolvedTranslations(this.#consent);

	/** @internal */
	protected readonly switchClasses = switchStyles;
	/** @internal */
	protected readonly copy = computed(() => ({
		...DEFAULT_COPY,
		...this.#translations().consentManagerDialog.vendors,
	}));
	/** @internal */
	protected readonly vendors = computed(() =>
		this.#consent.getDisplayedVendors(this.category())
	);
	/** @internal */
	protected readonly categoryOn = computed(
		() => this.#consent.selectedConsents()[this.category()] === true
	);
	/** @internal */
	protected readonly styles = computed(() =>
		this.resolvedNoStyle() ? undefined : vendorListStyles
	);
	/** @internal */
	protected readonly title = computed(() =>
		this.copy().title.replace('{count}', String(this.vendors().length))
	);

	// A set, not an object: a vendor id is any slug, and one such as
	// `constructor` would read an inherited member off a plain object as open.
	/** @internal */
	protected readonly openItems = signal<ReadonlySet<string>>(new Set());

	/** @internal */
	protected toggleOpen(id: string): void {
		const next = new Set(this.openItems());
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		this.openItems.set(next);
	}

	/** @internal */
	protected vendorName(vendor: ResolvedVendor): string {
		return vendor.name ?? vendor.id;
	}

	/** @internal */
	protected hasDetails(vendor: ResolvedVendor): boolean {
		return Boolean(vendor.description || vendor.privacyPolicyUrl);
	}

	/** @internal */
	protected isChecked(vendor: ResolvedVendor): boolean {
		return this.#consent.selectedVendors()[vendor.id] ?? true;
	}

	/** @internal */
	protected labelId(vendor: ResolvedVendor): string {
		return `${this.#uid}-vendor-${this.category()}-${vendor.id}`;
	}

	/** @internal */
	protected switchLabel(vendor: ResolvedVendor): string {
		return this.copy().switchLabel.replace('{vendor}', this.vendorName(vendor));
	}

	/** @internal */
	protected setVendor(vendorId: string, granted: boolean): void {
		this.#consent.setSelectedVendor(vendorId, granted);
	}
}
