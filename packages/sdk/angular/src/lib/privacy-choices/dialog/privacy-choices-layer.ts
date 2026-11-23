import { NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	output,
	viewChild,
} from '@angular/core';
import type { TemplateRef } from '@angular/core';
import { attachLiveRegion } from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import { ConsentTheme } from '../../core/consent-theme';
import { resolveNoStyle } from '../../core/no-style';
import { CloseIcon } from '../icons';
import { cx, slotPart } from '../parts';

/**
 * One card of the Privacy Choices dialog: the main dialog or a phone
 * sheet. Only the top layer is modal; a covered parent is inert, dims and
 * steps back (NEST-03). The host is the layer's `<section>`; the body is
 * the content between the tags, and `footer` renders in its footer.
 *
 * A layer's own `role="status"` region shows only messages the layer made,
 * and none while it closes (SR-01, SR-02).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-labelledby]': 'titleId()',
		'[attr.aria-modal]': 'top() && !closing() ? "true" : null',
		'[attr.class]': 'cardPart().className',
		'[attr.data-nested-open]': 'depth() > 0 ? "" : null',
		'[attr.data-nested]': 'nested() ? "true" : null',
		'[attr.data-regime]': 'eu() ? "eu" : "us"',
		'[attr.data-sheet]': 'sheetId() ?? null',
		'[attr.data-state]': 'closing() ? "closed" : "open"',
		'[attr.data-testid]':
			'nested() ? "consent-dialog-sheet" : "consent-dialog-card"',
		'[attr.inert]': '!top() || closing() ? "" : null',
		'[attr.style]': 'hostStyle()',
		role: 'dialog',
	},
	imports: [CloseIcon, NgTemplateOutlet],
	selector: 'section[inth-pc-layer]',
	template: `<header
			[attr.class]="part('consentDialogHeader', styles.header).className"
			[attr.style]="part('consentDialogHeader').style"
			[attr.data-testid]="nested() ? null : 'consent-dialog-header'"
		>
			<div>
				<h2
					#titleRef
					[attr.class]="part('consentDialogTitle', styles.title).className"
					[attr.style]="part('consentDialogTitle').style"
					[attr.id]="titleId()"
					tabindex="-1"
					[attr.data-testid]="nested() ? null : 'consent-dialog-title'"
				>
					{{ title() }}
				</h2>
				@if (intro()) {
					<p
						[attr.class]="cx(styles.intro)"
						[attr.data-testid]="nested() ? null : 'consent-dialog-intro'"
					>
						{{ intro() }}
					</p>
				}
			</div>
			<button
				type="button"
				[attr.class]="cx(styles.close)"
				[attr.aria-label]="closeLabel()"
				[attr.data-testid]="
					nested() ? 'consent-dialog-sheet-close' : 'consent-dialog-close'
				"
				(click)="closed.emit()"
			>
				<svg inth-pc-close></svg>
			</button>
		</header>
		<div
			#bodyRef
			[attr.class]="
				part('consentDialogContent', expandStyles.scroll, styles.body).className
			"
			[attr.style]="part('consentDialogContent').style"
			[attr.data-testid]="nested() ? null : 'consent-dialog-content'"
		>
			<ng-content />
		</div>
		<footer
			[attr.class]="part('consentDialogFooter', styles.footer).className"
			[attr.style]="part('consentDialogFooter').style"
			[attr.data-testid]="nested() ? null : 'consent-dialog-footer'"
		>
			@if (footer(); as content) {
				<ng-container [ngTemplateOutlet]="content" />
			}
		</footer>
		<div
			#statusRef
			[attr.class]="cx(styles.visuallyHidden)"
			[attr.data-testid]="nested() ? null : 'consent-dialog-status'"
		></div>`,
})
export class PrivacyChoicesLayer {
	readonly #theme = inject(ConsentTheme);
	readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

	readonly idPrefix = input.required<string>();
	readonly title = input.required<string>();
	readonly intro = input<string | null>(null);
	readonly closeLabel = input.required<string>();
	readonly footer = input<TemplateRef<unknown> | null>(null);
	/** The layer's message for its status region. */
	readonly status = input('');
	readonly nested = input(false);
	readonly top = input(true);
	readonly closing = input(false);
	readonly depth = input(0);
	readonly eu = input(false);
	readonly sheetId = input<string | undefined>(undefined);
	readonly noStyle = input<boolean | undefined>(undefined);
	/** The close button asked to close the layer. */
	readonly closed = output();

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly expandStyles = expandStyles;

	readonly #noStyle = resolveNoStyle(this.noStyle);
	private readonly titleElement =
		viewChild.required<ElementRef<HTMLElement>>('titleRef');
	private readonly bodyElement =
		viewChild.required<ElementRef<HTMLElement>>('bodyRef');
	private readonly statusElement =
		viewChild.required<ElementRef<HTMLElement>>('statusRef');
	#region: LiveRegion | null = null;

	/** @internal */
	protected readonly titleId = computed(() => `${this.idPrefix()}-title`);
	/** @internal */
	protected readonly cardPart = computed(() =>
		slotPart(
			this.nested() ? 'consentDialogSheet' : 'consentDialogCard',
			this.#theme.theme(),
			this.#noStyle(),
			styles.card
		)
	);
	/** @internal */
	protected readonly hostStyle = computed(
		() =>
			`${this.cardPart().style ?? ''}--consent-dialog-depth: ${this.depth()};`
	);
	readonly #shownStatus = computed(() =>
		this.top() && !this.closing() ? this.status() : ''
	);

	constructor() {
		afterNextRender(() => {
			this.#region = attachLiveRegion(this.statusElement().nativeElement);
			this.#region.render(this.#shownStatus());
		});
		effect(() => {
			const text = this.#shownStatus();
			this.#region?.render(text);
		});
		inject(DestroyRef).onDestroy(() => {
			this.#region?.();
			this.#region = null;
		});
	}

	/** The layer's own element, its modal boundary. */
	element(): HTMLElement {
		return this.#host.nativeElement;
	}

	/** The layer's heading, where focus lands when it opens. */
	heading(): HTMLElement {
		return this.titleElement().nativeElement;
	}

	/** The layer's scroll body. */
	body(): HTMLElement {
		return this.bodyElement().nativeElement;
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	/** @internal */
	protected part(
		key: Parameters<typeof slotPart>[0],
		...base: (string | undefined)[]
	) {
		return slotPart(key, this.#theme.theme(), this.#noStyle(), ...base);
	}
}
