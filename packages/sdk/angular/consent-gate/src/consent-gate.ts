/**
 * `<inth-consent-gate>`: keeps an embed out of the page until its consent
 * category is allowed.
 *
 * @packageDocumentation
 */

import { NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	DestroyRef,
	Directive,
	DOCUMENT,
	effect,
	inject,
	input,
	signal,
	TemplateRef,
} from '@angular/core';
import {
	CONSENT_GATE_SHEETS,
	ConsentButton,
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	resolveComponentStyles,
	SURFACE_SCOPES,
	toStyleAttribute,
	ɵNoStyleScope as NoStyleScope,
	ɵresolveNoStyle as resolveNoStyle,
} from '@inth/angular';
import type { AllConsentNames } from '@inth/sdk/engine';
import { defaultTranslationConfig } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-gate';
import { resolveTranslations } from '@inth/sdk/ui/utils';

/** What a gate's placeholder template receives. */
export interface ConsentGatePlaceholderContext {
	/** The gate's category. */
	readonly $implicit: AllConsentNames;
	/** The gate's category. */
	readonly category: AllConsentNames;
	/** Opens the consent dialog. */
	readonly openDialog: () => void;
}

/**
 * Marks the gated content as a template, so it is created only while the
 * category is allowed and destroyed when the visitor withdraws it.
 *
 * Without it, the gate projects its children. Projected nodes are created
 * with the parent view even while they are kept out of the document, so
 * an `<iframe>` loads nothing but a component inside still runs. Use the
 * template for content with side effects of its own.
 *
 * @example
 * ```html
 * <inth-consent-gate category="marketing">
 *   <ng-template inthConsentGateContent>
 *     <app-video-player />
 *   </ng-template>
 * </inth-consent-gate>
 * ```
 */
@Directive({ selector: 'ng-template[inthConsentGateContent]' })
export class ConsentGateContent {
	/** @internal */
	readonly template = inject<TemplateRef<void>>(TemplateRef);
}

/**
 * Replaces the gate's built-in placeholder while the category is denied.
 *
 * The template's context carries the category and an `openDialog()`
 * function.
 *
 * @example
 * ```html
 * <ng-template inthConsentGatePlaceholder let-category let-open="openDialog">
 *   <p>Allow {{ category }} to load this video.</p>
 *   <button type="button" (click)="open()">Choose video permissions</button>
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[inthConsentGatePlaceholder]' })
export class ConsentGatePlaceholder {
	/** @internal */
	readonly template =
		inject<TemplateRef<ConsentGatePlaceholderContext>>(TemplateRef);

	/** @internal */
	static ngTemplateContextGuard(
		_directive: ConsentGatePlaceholder,
		// oxlint-disable-next-line no-unused-vars -- The type predicate below names it.
		context: unknown
	): context is ConsentGatePlaceholderContext {
		return true;
	}
}

/**
 * Renders its content only while one consent category is allowed, and a
 * placeholder otherwise.
 *
 * The permission is `ConsentManager.effectivePermissions()[category]`, the
 * value `has(category)` reads: it can be granted before the visitor
 * chooses, under an opt-out policy, and a privacy signal such as Global
 * Privacy Control can override a recorded grant. With `vendor` set, the
 * content also waits for `isVendorAllowed(vendor)`.
 *
 * The host element is the wrapper and stays in the page in every state.
 * Until the gate has rendered in the browser it is empty, so the server
 * HTML holds neither the content nor the placeholder, and the browser
 * fills it one frame after the first render.
 *
 * The built-in placeholder shows the `consentGate.title` copy and a button
 * labelled with `consentGate.actionButton`, which opens the consent
 * dialog. It reads the `consentGate`, `consentGateTitle` and
 * `consentGateButton` theme slots; `consentGateButton` goes on top of
 * `buttonPrimary`.
 *
 * @example
 * ```html
 * <inth-consent-gate category="measurement" class="video">
 *   <iframe title="YouTube video" src="https://www.youtube-nocookie.com/embed/…"></iframe>
 *   <ng-template inthConsentGatePlaceholder>
 *     <p>Allow measurement to load this video.</p>
 *     <button type="button" inthConsentDialogLink>Choose video permissions</button>
 *   </ng-template>
 * </inth-consent-gate>
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentButton, NgTemplateOutlet],
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-consent-gate',
	styles: ':host { display: block; }',
	template: `
		@if (ready()) {
			@if (allowed()) {
				@if (contentTemplate(); as content) {
					<ng-container [ngTemplateOutlet]="content.template" />
				} @else {
					<ng-content />
				}
			} @else if (placeholderTemplate()) {
				<!-- No \`as\` alias: Angular 20 allows it only on the primary @if. -->
				<ng-container
					[ngTemplateOutlet]="placeholderTemplate()!.template"
					[ngTemplateOutletContext]="placeholderContext()"
				/>
			} @else {
				<div
					[class]="placeholderStyle().className || ''"
					[attr.style]="placeholderStyleAttribute()"
					data-testid="consent-gate-placeholder"
				>
					<div
						[class]="titleStyle().className || ''"
						[attr.style]="titleStyleAttribute()"
						data-testid="consent-gate-title"
					>
						{{ title() }}
					</div>
					@if (!policyBlocked()) {
						<button
							inth-consent-button
							[action]="'customize'"
							[variant]="'primary'"
							[mode]="'stroke'"
							[size]="'small'"
							[noStyle]="resolvedNoStyle()"
							[class]="buttonStyle().className || ''"
							[style]="buttonStyleAttribute()"
							data-testid="consent-gate-button"
						>
							{{ actionLabel() }}
						</button>
					}
				</div>
			}
		}
	`,
})
export class ConsentGate {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/**
	 * The category whose permission the content needs, such as
	 * `'measurement'` or `'marketing'`.
	 */
	readonly category = input.required<AllConsentNames>();
	/**
	 * A vendor id the content also needs, as declared in `vendors`, on a
	 * script or by the backend. The content waits for both the category and
	 * `isVendorAllowed(vendor)`.
	 */
	readonly vendor = input<string | undefined>(undefined);
	/** Drop inth's classes from the built-in placeholder. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly contentTemplate = contentChild(ConsentGateContent);
	/** @internal */
	protected readonly placeholderTemplate = contentChild(ConsentGatePlaceholder);

	/** @internal */
	protected readonly ready = signal(false);

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);

	/** @internal */
	protected readonly allowed = computed(() => {
		const granted =
			this.#consent.effectivePermissions()[this.category()] ?? false;
		const vendor = this.vendor();
		return (
			granted && (vendor === undefined || this.#consent.isVendorAllowed(vendor))
		);
	});

	readonly #translations = computed(() =>
		resolveTranslations(
			this.#consent.translationConfig(),
			defaultTranslationConfig
		)
	);

	readonly #categoryTitle = computed(() => {
		const category = this.category();
		return (
			this.#translations().consentTypes?.[category]?.title ??
			(category as string)
		);
	});

	/**
	 * Under a strict policy that leaves this category out, no choice can
	 * allow the content, so the built-in placeholder says so and offers no
	 * button, as the React and Vue gates do.
	 *
	 * @internal
	 */
	protected readonly policyBlocked = computed(() => {
		const { scope, scopeMode } = this.#consent.policyRule();
		const category = this.category();
		return (
			scopeMode === 'strict' &&
			category !== 'necessary' &&
			!(scope as readonly string[]).includes('*') &&
			!(scope as readonly string[]).includes(category)
		);
	});

	/** @internal */
	protected readonly title = computed(() => {
		const copy = this.#translations().consentGate;
		if (this.policyBlocked()) {
			return (
				copy?.policyBlocked ??
				"This content is unavailable under your region's consent policy."
			);
		}
		return (
			copy?.title ?? 'Accept {category} consent to view this content.'
		).replace('{category}', this.#categoryTitle());
	});

	/** @internal */
	protected readonly actionLabel = computed(() =>
		(
			this.#translations().consentGate?.actionButton ??
			'Enable {category} consent'
		).replace('{category}', this.#categoryTitle())
	);

	/** @internal */
	protected readonly placeholderStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveComponentStyles(
			'consentGate',
			this.#theme.theme(),
			{ baseClassName: styles.placeholder, noStyle },
			noStyle
		);
	});

	/** @internal */
	protected readonly placeholderStyleAttribute = computed(
		() => toStyleAttribute(this.placeholderStyle().style) ?? null
	);

	/** @internal */
	protected readonly titleStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveComponentStyles(
			'consentGateTitle',
			this.#theme.theme(),
			{ baseClassName: styles.title, noStyle },
			noStyle
		);
	});

	/** @internal */
	protected readonly titleStyleAttribute = computed(
		() => toStyleAttribute(this.titleStyle().style) ?? null
	);

	/**
	 * The `consentGateButton` slot. The button applies `buttonPrimary`
	 * itself; Angular merges this slot's class and style over it.
	 *
	 * @internal
	 */
	protected readonly buttonStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveComponentStyles(
			'consentGateButton',
			this.#theme.theme(),
			{ noStyle },
			noStyle
		);
	});

	/** @internal */
	protected readonly buttonStyleAttribute = computed(
		() => toStyleAttribute(this.buttonStyle().style) ?? ''
	);

	/** @internal */
	protected readonly placeholderContext = computed(
		(): ConsentGatePlaceholderContext => ({
			$implicit: this.category(),
			category: this.category(),
			openDialog: () => this.#consent.setActiveUI('dialog'),
		})
	);

	constructor() {
		const destroyRef = inject(DestroyRef);
		const view = inject(DOCUMENT).defaultView;
		// The built-in placeholder brings its rules, as Svelte's gate renders
		// its `SurfaceStyles` inside that branch.
		effect(() => {
			if (this.ready() && !this.allowed() && !this.placeholderTemplate()) {
				this.#styles.ensure(
					CONSENT_GATE_SHEETS,
					this.resolvedNoStyle(),
					SURFACE_SCOPES.gate
				);
			}
		});
		afterNextRender(() => {
			// One frame after the first render, as the other adapters do, so
			// a hydrated page does not flash the placeholder before the
			// visitor's stored choice applies.
			if (!view?.requestAnimationFrame) {
				this.ready.set(true);
				return;
			}
			const frame = view.requestAnimationFrame(() => this.ready.set(true));
			destroyRef.onDestroy(() => view.cancelAnimationFrame(frame));
		});
	}
}
