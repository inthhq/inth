/**
 * The statutory rights row: a segmented control for selling, sharing and
 * targeted ads, the confirmation that opting back in needs, and the GPC
 * note. Shared by the prompt's options and the dialog.
 *
 * @packageDocumentation
 */

import {
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	input,
	output,
	untracked,
	viewChild,
} from '@angular/core';
import {
	confirmSaleRight,
	pressSaleRight,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	RightOption,
	SaveUISource,
} from '@inth/sdk/engine';
import {
	resolvePrivacyChoicesCopy,
	resolveSaleAnnouncement,
	resolveSaleRightCopy,
} from '@inth/sdk/surface-state';
import type { SaleAnnouncementOutcome } from '@inth/sdk/surface-state';
import {
	revealInScrollBody,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import type { AllThemeKeys } from '@inth/sdk/ui/theme';

import { ConsentManager } from '../core/consent-manager';
import { ConsentTheme } from '../core/consent-theme';
import { resolveNoStyle } from '../core/no-style-scope';
import { ChoiceButton } from './choice-button';
import { CheckIcon } from './check-icon';
import { injectSurfaceSession, rightsBundleOf } from './inject-surface-session';
import { bool, cx, slotPart } from './part-class-names.model';

/** Surfaces that render the rights row, by their test-id prefix. */
export type RightsRowSurface = 'consent-banner' | 'consent-dialog';

/**
 * The row's test ids on each surface, spelled out so each one matches
 * `internals/conformance/src/contract/test-ids.ts`.
 */
const ROW_TEST_IDS = {
	'consent-banner': {
		allow: 'consent-banner-right-option-sale-allow',
		confirm: 'consent-banner-confirm',
		confirmAllow: 'consent-banner-confirm-allow',
		confirmCancel: 'consent-banner-confirm-cancel',
		protect: 'consent-banner-right-option-sale-protect',
		row: 'consent-banner-rights-row-sale',
	},
	'consent-dialog': {
		allow: 'consent-dialog-right-option-sale-allow',
		confirm: 'consent-dialog-confirm',
		confirmAllow: 'consent-dialog-confirm-allow',
		confirmCancel: 'consent-dialog-confirm-cancel',
		protect: 'consent-dialog-right-option-sale-protect',
		row: 'consent-dialog-rights-row-sale',
	},
} as const satisfies Record<RightsRowSurface, Record<string, string>>;

const OPTIONS: readonly RightOption[] = ['protect', 'allow'];

/**
 * Whether a surface renders the sale row: the policy has a category that
 * decides sale.
 *
 * @internal
 */
export const hasSaleRight = function hasSaleRight(
	snapshot: ConsentSnapshot
): boolean {
	const right = resolveSaleRight(snapshot);
	return right.available && right.category !== null;
};

/**
 * The sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04). Refusing applies in
 * one press; allowing a refusal, or any grant under opt-in, opens the
 * confirmation in place and records nothing until the visitor confirms
 * (LAW-02). Pressing Allow again while it is open nudges (RIGHT-04).
 *
 * The host is the row's `<section>`. Render it only while
 * {@link hasSaleRight} holds: with no category that decides sale there is
 * no row.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-labelledby]': 'ids().title',
		'[attr.class]': 'rowPart().className',
		'[attr.data-testid]': 'testIds().row',
		'[attr.style]': 'rowPart().style',
	},
	imports: [CheckIcon, ChoiceButton],
	selector: 'section[inth-rights-row]',
	template: `<div>
			<h3
				[attr.class]="cx(styles.rightTitle)"
				[attr.id]="ids().title"
			>
				{{ copy().title }}
			</h3>
			@if (!right().locked) {
				<p
					[attr.class]="cx(styles.rightDescription)"
					[attr.id]="ids().description"
				>
					{{ copy().description }}
				</p>
			}
		</div>
		@if (right().locked) {
			<div
				[attr.class]="cx(styles.note)"
				[attr.id]="ids().description"
			>
				<span>{{ copy().description }}</span>
			</div>
		}
		<div
			[attr.class]="cx(styles.segmented)"
			role="group"
			[attr.aria-label]="copy().groupLabel"
			[attr.aria-describedby]="ids().description"
			[attr.data-selected]="right().selected === 'protect' ? '0' : '1'"
		>
			<span
				[attr.class]="cx(styles.segmentedThumb)"
				aria-hidden="true"
			></span>
			@for (option of options; track option) {
				<button
					type="button"
					[attr.class]="cx(styles.segmentedOption)"
					[attr.aria-pressed]="bool(right().selected === option)"
					[attr.aria-disabled]="
						right().locked && right().selected !== option ? 'true' : null
					"
					[attr.data-right-option]="option"
					[attr.data-testid]="testIds()[option]"
					(click)="press(option)"
				>
					<span
						[attr.class]="cx(styles.segmentedCheck)"
						aria-hidden="true"
					>
						<svg
							inth-check-glyph
							[size]="13"
						></svg>
					</span>
					{{ option === 'protect' ? copy().protect : copy().allow }}
				</button>
			}
		</div>
		<div
			[attr.class]="cx(expandStyles.panel, styles.bleed)"
			[attr.id]="ids().panel"
			[attr.data-open]="bool(open())"
			[attr.inert]="open() ? null : ''"
		>
			<div [attr.class]="cx(expandStyles.inner)">
				<div
					#confirm
					[attr.class]="cx(styles.confirm)"
					role="group"
					[attr.aria-labelledby]="ids().confirmTitle"
					[attr.aria-describedby]="ids().confirmDescription"
					[attr.data-nudged]="bool(nudges() > 0)"
					[attr.data-testid]="testIds().confirm"
				>
					<p
						[attr.class]="cx(styles.confirmTitle)"
						[attr.id]="ids().confirmTitle"
					>
						{{ copy().confirmTitle }}
					</p>
					<p
						[attr.class]="cx(styles.confirmDescription)"
						[attr.id]="ids().confirmDescription"
					>
						{{ copy().confirmDescription }}
					</p>
					<div [attr.class]="cx(styles.confirmActions)">
						<button
							#cancel
							inth-choice-button
							[variant]="'neutral'"
							[mode]="'stroke'"
							[attr.id]="ids().cancel"
							[attr.data-testid]="testIds().confirmCancel"
							(click)="session().closeConfirmation()"
						>
							{{ copy().confirmCancel }}
						</button>
						<button
							inth-choice-button
							[variant]="'neutral'"
							[mode]="'stroke'"
							[attr.data-testid]="testIds().confirmAllow"
							(click)="confirmAllow()"
						>
							{{ copy().confirmAllow }}
						</button>
					</div>
				</div>
			</div>
		</div> `,
})
export class SaleRightsRow {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

	/**
	 * Prefix for the row's element ids. Each layer that renders the row
	 * passes its own, so `aria-labelledby` never resolves into another
	 * layer (SR-05).
	 */
	readonly idPrefix = input.required<string>();
	/** The surface it renders on, which prefixes its test ids. */
	readonly testIdPrefix = input.required<RightsRowSurface>();
	/** The site's name for `{business}`. */
	readonly business = input<string | undefined>(undefined);
	/** Surface the recorded choice is attributed to. */
	readonly uiSource = input<SaveUISource | undefined>(undefined);
	/** The theme slot that styles the row. */
	readonly slot = input<AllThemeKeys | undefined>(undefined);
	/** Drop the stock classes. Defaults to the surface's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Emits after the row recorded a choice, for the dialog's "Saved" cue. */
	readonly recorded = output();

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly expandStyles = expandStyles;
	/** @internal */
	protected readonly options = OPTIONS;
	/** @internal */
	protected readonly bool = bool;

	readonly #noStyle = resolveNoStyle(this.noStyle);
	readonly #surface = injectSurfaceSession();
	/** @internal */
	protected readonly session = this.#surface.session;

	private readonly confirm = viewChild<ElementRef<HTMLElement>>('confirm');
	private readonly cancel = viewChild('cancel', { read: ElementRef });

	/** @internal */
	protected readonly right = computed(() =>
		resolveSaleRight(this.#consent.snapshot())
	);
	/** @internal */
	protected readonly open = computed(
		() => this.#surface.state().confirmation?.right === 'sale'
	);
	/** @internal */
	protected readonly nudges = computed(() =>
		this.open() ? (this.#surface.state().confirmation?.nudges ?? 0) : 0
	);
	readonly #bundle = computed(() =>
		rightsBundleOf(this.#consent.snapshot(), this.#consent.ɵoptOutReceiptData())
	);
	/** @internal */
	protected readonly copy = computed(() => {
		const right = this.right();
		return resolveSaleRightCopy(this.#consent.copy(), {
			bundle: this.#bundle(),
			business: this.business(),
			locked: right.locked,
			model: this.#consent.snapshot().evaluationPolicy.model,
			selected: right.selected,
			source: right.source,
		});
	});
	/** @internal */
	protected readonly testIds = computed(
		() => ROW_TEST_IDS[this.testIdPrefix()]
	);
	/** @internal */
	protected readonly ids = computed(() => {
		const prefix = this.idPrefix();
		return {
			cancel: `${prefix}-sale-confirm-cancel`,
			confirmDescription: `${prefix}-sale-confirm-description`,
			confirmTitle: `${prefix}-sale-confirm-title`,
			description: `${prefix}-sale-description`,
			panel: `${prefix}-sale-confirm`,
			title: `${prefix}-sale-title`,
		};
	});
	/** @internal */
	protected readonly rowPart = computed(() =>
		slotPart(this.slot(), this.#theme.theme(), this.#noStyle(), styles.right)
	);

	constructor() {
		let wasOpen = false;
		let cancelReveal: (() => void) | undefined;
		// Focus follows the confirmation: Cancel when it opens (RIGHT-06), the
		// invoking Allow when it closes from inside it. After render, once the
		// panel is no longer inert.
		afterRenderEffect((onCleanup) => {
			const open = this.open();
			const confirm = this.confirm()?.nativeElement;
			untracked(() => {
				if (open && !wasOpen) {
					this.#cancelButton()?.focus({ preventScroll: true });
					// Bring the question into view in the scroll body only, once
					// it has started to open, unless the surface moved on
					// (RIGHT-07, LAY-05, PERM-16).
					const session = this.session();
					const { token } = session.getState();
					cancelReveal = scheduleReveal(
						() => {
							if (confirm) {
								revealInScrollBody(confirm);
							}
						},
						{ isCurrent: () => session.isCurrent(token) }
					);
				} else if (
					!open &&
					wasOpen &&
					confirm &&
					(confirm.contains(document.activeElement) ||
						document.activeElement === document.body)
				) {
					this.#allowButton()?.focus({ preventScroll: true });
				}
				wasOpen = open;
			});
			onCleanup(() => {
				cancelReveal?.();
				cancelReveal = undefined;
			});
		});
		// Replay the shake on every nudge; the red ring stays until it closes.
		afterRenderEffect(() => {
			const nudges = this.nudges();
			const confirm = this.confirm()?.nativeElement;
			if (!confirm || nudges === 0) {
				return;
			}
			untracked(() => {
				confirm.dataset['nudged'] = 'false';
				void confirm.offsetWidth;
				confirm.dataset['nudged'] = 'true';
				this.#cancelButton()?.focus({ preventScroll: true });
			});
		});
	}

	/** @internal */
	protected cx(...names: (string | undefined)[]): string | null {
		return cx(this.#noStyle(), ...names);
	}

	#cancelButton(): HTMLElement | undefined {
		return this.cancel()?.nativeElement as HTMLElement | undefined;
	}

	#allowButton(): HTMLElement | null {
		return this.#host.nativeElement.querySelector<HTMLElement>(
			'[data-right-option="allow"]'
		);
	}

	/** Say what was recorded, ending in "Saved." (LAW-04). */
	#recorded(outcome: SaleAnnouncementOutcome): void {
		this.session().announce(
			resolveSaleAnnouncement(this.#consent.copy(), {
				bundle: this.#bundle(),
				model: this.#consent.snapshot().evaluationPolicy.model,
				outcome,
			})
		);
		this.recorded.emit();
	}

	/** @internal */
	protected press(option: RightOption): void {
		const { outcome } = pressSaleRight(this.#consent.kernel(), option, {
			uiSource: this.uiSource(),
		});
		if (outcome === 'nudge') {
			this.session().announce(
				resolvePrivacyChoicesCopy(this.#consent.copy()).nudge
			);
		} else if (outcome === 'apply-protect') {
			this.#recorded('protect');
		} else if (outcome === 'apply-allow') {
			this.#recorded('allow');
		} else if (outcome === 'record-default') {
			this.#recorded('recorded');
		}
	}

	/** @internal */
	protected confirmAllow(): void {
		if (
			confirmSaleRight(this.#consent.kernel(), { uiSource: this.uiSource() })
		) {
			this.#recorded('allow');
		}
	}
}
