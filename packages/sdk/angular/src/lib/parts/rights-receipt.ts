/**
 * The receipt under the rights rows: one line, a Details disclosure, and a
 * reference to copy (RCPT-*, CLIP-*, GPC-06).
 *
 * @packageDocumentation
 */

import type { ElementRef } from '@angular/core';
import {
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	untracked,
	viewChild,
} from '@angular/core';
import { copySurfaceReference, resolveRightsReceipt } from '@inth/sdk/engine';
import { resolveRightsReceiptCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import type { AllThemeKeys } from '@inth/sdk/ui/theme';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style-scope';
import { CheckIcon, ChevronIcon, CopyIcon } from './icons';
import { injectSurfaceSession, rightsBundleOf } from './inject-surface-session';
import { bool, cx, slotPart } from './part-class-names.model';

/** How long the copy button shows its check. */
const COPIED_MS = 1500;

/**
 * The receipt (RCPT-01): "✓ Saved for this browser · Jan 15, 2026" with
 * Details, shown only once something is recorded or a GPC signal is
 * honored, and then read as live (GPC-06). It stays mounted and toggles
 * `data-open`, so the rows below never move or lose focus (RCPT-03). The
 * host is the receipt's disclosure element.
 *
 * Copying the reference announces only after the clipboard accepted it.
 * When it fails, a labelled field holds the full reference; it takes focus
 * only if Details is still open (CLIP-01, CLIP-03). The surface session
 * tokens each attempt, so a late result is ignored (CLIP-02).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.class]': 'rootPart().className',
		'[attr.data-open]': 'bool(receipt().show)',
		'[attr.data-receipt-kind]': 'receipt().show ? receipt().kind : null',
		'[attr.inert]': 'receipt().show ? null : ""',
		'[attr.style]': 'rootPart().style',
		'data-testid': 'consent-dialog-receipt',
		// Focusable from code only: the dialog opens on it after an opt-out.
		tabindex: '-1',
	},
	imports: [CheckIcon, ChevronIcon, CopyIcon],
	selector: 'div[inth-rights-receipt]',
	template: `<div [attr.class]="cx(styles.disclosureInner)">
		<div [attr.class]="cx(styles.receipt)">
			<div [attr.class]="cx(styles.receiptLine)">
				<span [attr.class]="cx(styles.receiptLead)"
					><svg inth-check-glyph></svg><span>{{ copy().lead }}</span></span
				>
				<button
					type="button"
					[attr.class]="cx(styles.textButton)"
					[attr.aria-expanded]="bool(detailsOpen())"
					[attr.aria-controls]="ids().details"
					data-testid="consent-dialog-receipt-toggle"
					(click)="session().toggleReceipt()"
				>
					{{ copy().details
					}}<span [attr.class]="cx(styles.chevron)"
						><svg
							inth-chevron-glyph
							[size]="12"
						></svg
					></span>
				</button>
			</div>
			<div
				[attr.class]="cx(styles.disclosure)"
				[attr.id]="ids().details"
				[attr.data-open]="bool(detailsOpen())"
				[attr.inert]="detailsOpen() ? null : ''"
				data-testid="consent-dialog-receipt-details"
			>
				<div [attr.class]="cx(styles.disclosureInner)">
					<div [attr.class]="cx(styles.receiptDetails)">
						<ul>
							@for (item of copy().items; track item.text) {
								<li>
									{{ item.text }}
									@if (item.source) {
										<span [attr.class]="cx(styles.receiptMuted)">{{
											' · ' + item.source
										}}</span>
									}
								</li>
							}
						</ul>
						<div [attr.class]="cx(styles.receiptMuted)">
							{{ copy().scope }}
						</div>
						<div [attr.class]="cx(styles.receiptMuted)">
							{{ copy().recorded }}
							@if (receipt().kind === 'stored' && receipt().reference) {
								{{ ' · ' + copy().referenceLabel + ' ' }}
								<span
									[attr.class]="cx(styles.reference)"
									[attr.title]="receipt().reference"
									>{{ referenceShort()
									}}<button
										type="button"
										[attr.class]="cx(styles.copyButton)"
										[attr.aria-label]="copy().copy"
										[attr.data-copied]="
											copyStatus() === 'copied' ? 'true' : null
										"
										data-testid="consent-dialog-copy-reference"
										(click)="copyReference()"
									>
										@if (copyStatus() === 'copied') {
											<svg inth-check-glyph></svg>
										} @else {
											<svg inth-copy-glyph></svg>
										}</button
								></span>
							}
						</div>
						@if (copyStatus() === 'failed' && receipt().reference) {
							<div>
								<label
									[attr.for]="ids().field"
									[attr.id]="ids().fieldLabel"
									>{{ copy().copyFailedLabel }}</label
								>
								<input
									#field
									[attr.id]="ids().field"
									[attr.class]="cx(styles.referenceField)"
									type="text"
									readonly
									[value]="receipt().reference"
									data-testid="consent-dialog-reference-field"
								/>
							</div>
						}
					</div>
				</div>
			</div>
		</div>
	</div>`,
})
export class RightsReceipt {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/** Prefix for element ids in this layer (SR-05). */
	readonly idPrefix = input.required<string>();
	/** The site's name for `{business}`. */
	readonly business = input<string | undefined>(undefined);
	/** The theme slot that styles the receipt. */
	readonly slot = input<AllThemeKeys | undefined>(undefined);
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * The receipt's panel shows although its banner is not expanded, as in
	 * an all-in-one side drawer, so a failed copy may still reveal the
	 * fallback field there.
	 */
	readonly panelVisible = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly bool = bool;

	readonly #noStyle = resolveNoStyle(this.noStyle);
	readonly #surface = injectSurfaceSession();
	/** @internal */
	protected readonly session = this.#surface.session;
	private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

	/**
	 * This browser's local opt-out receipt data: the reference it recorded.
	 * The consent manager serves the server's value until hydration ends.
	 */
	readonly #local = this.#consent.ɵoptOutReceiptData;

	/** @internal */
	protected readonly receipt = computed(() =>
		resolveRightsReceipt(this.#consent.snapshot(), this.#local())
	);
	/** @internal */
	protected readonly copy = computed(() =>
		resolveRightsReceiptCopy(this.#consent.copy(), {
			bundle: rightsBundleOf(this.#consent.snapshot(), this.#local()),
			business: this.business(),
			receipt: this.receipt(),
		})
	);
	/** @internal */
	protected readonly detailsOpen = computed(
		() => this.#surface.state().receiptOpen && this.receipt().show
	);
	/** @internal */
	protected readonly copyStatus = computed(
		() => this.#surface.state().copy.status
	);
	/** @internal */
	protected readonly referenceShort = computed(
		() => this.receipt().reference?.slice(0, 8) ?? ''
	);
	/** @internal */
	protected readonly ids = computed(() => {
		const prefix = this.idPrefix();
		return {
			details: `${prefix}-receipt-details`,
			field: `${prefix}-reference-field`,
			fieldLabel: `${prefix}-reference-field-label`,
		};
	});
	/** @internal */
	protected readonly rootPart = computed(() =>
		slotPart(
			this.slot(),
			this.#theme.theme(),
			this.#noStyle(),
			styles.disclosure,
			styles.bleed
		)
	);

	/** The failed copy's field takes focus once it renders. */
	#focusField = false;

	constructor() {
		// The check on the copy button goes after a moment.
		effect((onCleanup) => {
			if (this.copyStatus() !== 'copied') {
				return;
			}
			const session = untracked(this.session);
			const timer = setTimeout(() => session.resetCopy(), COPIED_MS);
			onCleanup(() => clearTimeout(timer));
		});
		afterRenderEffect(() => {
			const field = this.field()?.nativeElement;
			if (field && this.#focusField) {
				this.#focusField = false;
				field.focus({ preventScroll: true });
				field.select();
			}
		});
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	/** @internal */
	protected async copyReference(): Promise<void> {
		const { reference } = this.receipt();
		if (!reference) {
			return;
		}
		const finish = await copySurfaceReference(
			this.#consent.kernel(),
			reference,
			undefined,
			{ panelVisible: this.panelVisible() }
		);
		if (!(finish.applied && finish.reveal)) {
			return;
		}
		const session = this.session();
		const failed = session.getState().copy.status === 'failed';
		const copy = this.copy();
		session.announce(failed ? copy.copyFailed : copy.copied);
		if (failed) {
			// The field renders with the failure; focus it once it has.
			this.#focusField = true;
			const field = this.field()?.nativeElement;
			if (field) {
				this.#focusField = false;
				field.focus({ preventScroll: true });
				field.select();
			}
		}
	}
}
