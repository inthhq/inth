/**
 * The "Your Privacy Choices" dialog (v6): one column whose body is the
 * only scroller, the statutory rights on its first view, the receipt, and
 * Preferences; in the EU, the cookie categories and a staged Save. On
 * phone, Preferences and EU vendor lists open as nested sheets, at most
 * two layers; desktop uses accordions only.
 *
 * @packageDocumentation
 */

import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	linkedSignal,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import {
	commitDialogChoice,
	MAIN_LAYER,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type {
	AllConsentNames,
	BannerCommitAction,
	LegalLinks,
} from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import {
	announcementText,
	resolveCategoryTitle,
	resolveLegacyConsentPresentation,
	resolvePreferencesRowCopy,
	resolvePrivacyChoicesDialogCopy,
	resolvePrivacyChoicesRegime,
	resolveVendorTableCopy,
} from '@inth/sdk/surface-state';
import {
	attachBackdropGuard,
	attachPageBlock,
	attachScrollFades,
	attachTopLayerTrap,
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import { getTextDirection } from '@inth/sdk/ui/utils/text-direction';

import { ConsentManager } from '../../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../../core/consent-styles';
import { ConsentTheme } from '../../core/consent-theme';
import { NoStyleScope, resolveNoStyle } from '../../core/no-style';
import { uniqueId } from '../../core/unique-id';
import { AdvertisingRow, CategoryGroup } from '../category-group';
import type { OpenVendorsRequest } from '../category-group';
import { ChoiceButton } from '../choice-button';
import { CheckIcon, ChevronIcon } from '../icons';
import { bool, cx, slotPart } from '../parts';
import { RightsReceipt } from '../receipt';
import { takeReceiptFocus } from '../receipt-focus';
import { hasSaleRight, SaleRightsRow } from '../rights-row';
import { SurfaceDraft } from '../surface-draft';
import { injectPhoneLayout, injectSurfaceSession } from '../surface-session';
import { PrivacyChoicesLayer } from './privacy-choices-layer';
import { PRIVACY_CHOICES_DIALOG_SHEETS } from './privacy-choices-sheets';

/** Which of the provider's legal links the dialog shows (`ConsentDialogLegalLinks`). */
type ConsentDialogLegalLinks = readonly (keyof LegalLinks)[] | null;

/** The "Saved" cue stays this long, on a timer, not an animation (MOT-03). */
const CUE_MS = 1700;
/** A closing sheet animates out this long, inert (NEST-03). */
const SHEET_EXIT_MS = 160;
/** The opener key of the Preferences row. */
const PREFERENCES_OPENER = 'preferences';
const PREFERENCES_SHEET = 'preferences';
const VENDOR_SHEET_PREFIX = 'vendors:';
/**
 * Where focus goes when the dialog's opener is gone (FOC-03): "Your
 * Privacy Choices", the floating trigger, then a `[inthConsentDialogLink]`.
 */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
	'[data-testid="consent-dialog-link"]',
];

/** How many frames to wait for a returning banner, which may still be loading. */
const BANNER_RETURN_FRAMES = 60;

/** Focus the banner card once it renders again. */
const focusReturningBanner = function focusReturningBanner(): void {
	let frames = 0;
	const attempt = () => {
		const card = document.querySelector<HTMLElement>(
			'[data-testid="consent-banner-card"]'
		);
		if (card) {
			card.focus({ preventScroll: true });
			return;
		}
		frames += 1;
		if (frames < BANNER_RETURN_FRAMES) {
			requestAnimationFrame(attempt);
		}
	};
	requestAnimationFrame(attempt);
};

/** The sheet showing, kept while it animates out. */
interface ShownSheet {
	readonly id: string;
	readonly closing: boolean;
}

/**
 * The Privacy Choices dialog with its own preference draft, so the EU's
 * switches stay staged until Save (EU-02) and the US's apply one by one.
 * Loaded by `<inth-consent-dialog>` when it opens under the Privacy
 * Choices design.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { style: 'display: contents' },
	imports: [
		AdvertisingRow,
		CategoryGroup,
		CheckIcon,
		ChevronIcon,
		ChoiceButton,
		NgTemplateOutlet,
		PrivacyChoicesLayer,
		RightsReceipt,
		SaleRightsRow,
	],
	providers: [NoStyleScope, SurfaceDraft],
	selector: 'inth-pc-dialog',
	template: `@if (isOpen()) {
			<div
				#backdrop
				[attr.class]="rootPart().className"
				[attr.style]="rootPart().style"
				[attr.data-animation]="animationOff() ? 'off' : null"
				[attr.data-edge-style]="edgeStyle()"
				data-design="privacy-choices"
				[attr.data-regime]="eu() ? 'eu' : 'us'"
				[attr.data-layout]="phone() ? 'phone' : 'desktop'"
				data-testid="consent-dialog-root"
				data-inth-surface="dialog"
				[attr.dir]="textDirection()"
			>
				<section
					inth-pc-layer
					#main
					[idPrefix]="prefix + '-main'"
					[title]="copy().title"
					[intro]="intro()"
					[closeLabel]="copy().close"
					[footer]="mainFooter"
					[status]="mainStatus()"
					[nested]="false"
					[top]="!sheetOpen()"
					[depth]="sheetOpen() ? 1 : 0"
					[eu]="eu()"
					(closed)="close()"
				>
					@if (eu()) {
						<div
							inth-pc-category-group
							[idPrefix]="prefix + '-main'"
							[testIdPrefix]="'consent-dialog'"
							[vendors]="phone() ? 'sheet' : 'accordion'"
							[slot]="'consentDialogCategoryGroup'"
							[vendorTableSlot]="'consentDialogVendorTable'"
							(openVendors)="openVendors($event)"
						></div>
					} @else {
						@if (saleAvailable()) {
							<section
								inth-pc-rights-row
								[idPrefix]="prefix + '-main'"
								[testIdPrefix]="'consent-dialog'"
								[uiSource]="'dialog'"
								[slot]="'consentDialogRightsRow'"
								(recorded)="showCue()"
							></section>
						}
						<div
							inth-pc-receipt
							[idPrefix]="prefix + '-main'"
							[slot]="'consentDialogReceipt'"
						></div>
						<button
							type="button"
							[attr.class]="
								part('consentDialogPreferencesRow', styles.navRow).className
							"
							[attr.style]="part('consentDialogPreferencesRow').style"
							[attr.aria-expanded]="phone() ? null : bool(preferencesOpen())"
							[attr.aria-controls]="phone() ? null : prefix + '-preferences'"
							[attr.aria-haspopup]="phone() ? 'dialog' : null"
							data-opener="preferences"
							data-testid="consent-dialog-preferences-row"
							(click)="preferencesClick()"
						>
							<span [attr.class]="cx(styles.navRowLabel)"
								>{{ preferencesCopy().title
								}}<span [attr.class]="cx(styles.navRowMeta)">{{
									preferencesCopy().summary + ' · ' + preferencesCopy().onCount
								}}</span></span
							>
							<span
								[attr.class]="cx(styles.chevron)"
								[attr.data-direction]="phone() ? 'end' : 'down'"
								><svg
									inth-pc-chevron
									[direction]="phone() ? 'end' : 'down'"
								></svg
							></span>
						</button>
						@if (!phone()) {
							<div
								[attr.class]="cx(styles.disclosure)"
								[attr.id]="prefix + '-preferences'"
								[attr.data-open]="bool(preferencesOpen())"
								[attr.inert]="preferencesOpen() ? null : ''"
								data-testid="consent-dialog-preferences-panel"
							>
								<div [attr.class]="cx(styles.disclosureInner)">
									<div [attr.class]="cx(styles.preferencesPanel)">
										<ng-container
											[ngTemplateOutlet]="usCategories"
											[ngTemplateOutletContext]="{
												$implicit: prefix + '-main',
											}"
										/>
									</div>
								</div>
							</div>
						}
					}
				</section>
				@if (shownSheet(); as sheet) {
					<section
						inth-pc-layer
						#sheetLayer
						[idPrefix]="prefix + '-sheet'"
						[title]="sheetTitle()"
						[intro]="sheetIntro()"
						[closeLabel]="sheetCloseLabel()"
						[footer]="sheetFooter"
						[status]="sheetStatus()"
						[nested]="true"
						[top]="true"
						[closing]="sheet.closing"
						[depth]="0"
						[eu]="eu()"
						[sheetId]="sheet.id"
						(closed)="popSheet()"
					>
						@if (vendorCategory(); as category) {
							<div
								inth-pc-category-group
								[idPrefix]="prefix + '-sheet'"
								[testIdPrefix]="'consent-dialog'"
								[only]="category"
								[vendors]="'inline'"
								[slot]="'consentDialogCategoryGroup'"
								[vendorTableSlot]="'consentDialogVendorTable'"
							></div>
						} @else {
							<ng-container
								[ngTemplateOutlet]="usCategories"
								[ngTemplateOutletContext]="{ $implicit: prefix + '-sheet' }"
							/>
						}
					</section>
				}
			</div>
		}
		<ng-template
			#usCategories
			let-idPrefix
		>
			<div
				inth-pc-category-group
				[idPrefix]="idPrefix"
				[testIdPrefix]="'consent-dialog'"
				[exclude]="usExclude()"
				[apply]="'immediate'"
				[uiSource]="'dialog'"
				[vendors]="'accordion'"
				[slot]="'consentDialogCategoryGroup'"
				[vendorTableSlot]="'consentDialogVendorTable'"
				(applied)="showCue()"
			>
				@if (saleCategory()) {
					<div
						inth-pc-advertising-row
						[on]="saleOn()"
						[idPrefix]="prefix"
						[testId]="'consent-dialog-advertising-row'"
					></div>
				}
			</div>
		</ng-template>
		<ng-template #mainFooter>
			@if (legal(); as legal) {
				<a
					[attr.class]="cx(styles.quietLink)"
					[attr.href]="legal.href"
					[attr.target]="legal.target"
					[attr.rel]="legal.rel ?? null"
					[attr.data-testid]="
						eu()
							? 'consent-dialog-legal-link-cookiePolicy'
							: 'consent-dialog-legal-link-privacyPolicy'
					"
					>{{ legal.label }}</a
				>
			} @else {
				<span></span>
			}
			<div [attr.class]="cx(styles.footerActions)">
				@if (eu()) {
					<button
						inth-choice-button
						[consentAction]="'reject'"
						[variant]="'neutral'"
						[mode]="'stroke'"
						data-testid="consent-dialog-reject-all"
						(click)="commit('refuse')"
					>
						{{ copy().rejectAll }}
					</button>
					<button
						inth-choice-button
						[consentAction]="'accept'"
						[variant]="'neutral'"
						[mode]="'stroke'"
						data-testid="consent-dialog-accept-all"
						(click)="commit('allow')"
					>
						{{ copy().acceptAll }}
					</button>
					<!-- Enabled only once what would run differs from the record (EU-03). -->
					<button
						inth-choice-button
						[consentAction]="'save'"
						[primary]="true"
						[slot]="'consentDialogSaveButton'"
						[disabled]="!hasChanges()"
						data-testid="consent-dialog-save-button"
						(click)="commit('save')"
					>
						{{ copy().save }}
					</button>
				} @else {
					<ng-container
						[ngTemplateOutlet]="doneButton"
						[ngTemplateOutletContext]="{
							cue: shownSheet() ? 0 : cue(),
							testId: 'consent-dialog-done',
							sheet: false,
						}"
					/>
				}
			</div>
		</ng-template>
		<ng-template #sheetFooter>
			<span [attr.class]="cx(styles.footerNote)">{{ copy().sheetNote }}</span>
			<div [attr.class]="cx(styles.footerActions)">
				<ng-container
					[ngTemplateOutlet]="doneButton"
					[ngTemplateOutletContext]="{
						cue: eu() ? 0 : cue(),
						testId: 'consent-dialog-sheet-done',
						sheet: true,
					}"
				/>
			</div>
		</ng-template>
		<!-- Done closes and commits nothing (LAW-04). Its label never changes
		(SR-07): the cue sits beside it, and its slot is always there, so Done
		keeps its node and focus (FOC-06, MOT-04). -->
		<ng-template
			#doneButton
			let-cue="cue"
			let-testId="testId"
			let-sheet="sheet"
		>
			<span
				[attr.class]="cx(styles.cueSlot)"
				aria-hidden="true"
			>
				@for (shown of cueKeys(cue); track shown) {
					<span
						[attr.class]="cx(styles.savedCue)"
						data-testid="consent-dialog-saved-cue"
						><svg inth-pc-check></svg>{{ copy().savedCue }}</span
					>
				}
			</span>
			<button
				inth-choice-button
				[primary]="true"
				[slot]="'consentDialogDoneButton'"
				[baseClass]="styles.done"
				[attr.data-cue]="cue > 0 ? 'true' : null"
				[attr.data-testid]="testId"
				(click)="sheet ? popSheet() : close()"
			>
				<span
					[attr.class]="cx(styles.doneCheck)"
					aria-hidden="true"
					><svg inth-pc-check></svg></span
				>{{ copy().done }}
			</button>
		</ng-template>`,
})
export class PrivacyChoicesDialog {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);
	readonly #draft = inject(SurfaceDraft);

	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/** Skip the sheet exit. Defaults to the provider's `disableAnimation`. */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/**
	 * Control the open state. `true` asks the consent manager to show the
	 * dialog, so the banner leaves and sheets, Escape and the receipt work
	 * as for any open dialog; Close and Escape then close it through the
	 * consent manager and emit `openChange(false)`, and `open` must turn
	 * `false` and back to `true` to ask again. `false` hides it whatever the
	 * consent manager shows, and turning it `false` while the dialog shows
	 * closes it through the consent manager, as Close does. Unset, it follows
	 * `activeUI === 'dialog'`.
	 */
	readonly open = input<boolean | undefined>(undefined);
	/** Emits `false` when a controlled dialog asks to close. */
	readonly openChange = output<boolean>();
	/** The policy models the dialog opens for. */
	readonly models = input<readonly string[] | undefined>(undefined);
	/**
	 * Which legal link the footer may show: the Cookie Policy for the EU,
	 * the Privacy Policy for the US. `undefined` shows it, `null` hides it,
	 * and a list shows it only when its key is in the list.
	 */
	readonly legalLinks = input<ConsentDialogLegalLinks | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly bool = bool;
	/** @internal */
	protected readonly prefix = uniqueId('inth-pcd');

	readonly #noStyle = resolveNoStyle(this.noStyle);
	readonly #surface = injectSurfaceSession();
	/** @internal */
	protected readonly phone = injectPhoneLayout();
	readonly #reducedMotion = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);
	/**
	 * `disableAnimation`, from the input or the provider: the root carries
	 * `data-animation="off"`, and a closing sheet leaves at once.
	 *
	 * @internal
	 */
	protected readonly animationOff = computed(() => this.#reducedMotion());

	private readonly backdrop = viewChild<ElementRef<HTMLElement>>('backdrop');
	private readonly mainLayer = viewChild('main', { read: PrivacyChoicesLayer });
	private readonly sheetLayer = viewChild('sheetLayer', {
		read: PrivacyChoicesLayer,
	});

	/**
	 * The model and the US markers decide the body, never the prompt: an EU
	 * opt-in policy that shows no banner still gets the EU dialog.
	 *
	 * @internal
	 */
	protected readonly eu = computed(
		() =>
			resolvePrivacyChoicesRegime(this.#consent.snapshot().policyRule) === 'eu'
	);
	readonly #modelAllowed = computed(() => {
		const models = this.models();
		return !models || models.includes(this.#consent.model());
	});
	/** @internal */
	protected readonly isOpen = computed(
		() =>
			this.open() !== false &&
			this.#consent.activeUI() === 'dialog' &&
			this.#consent.hasConsentUi() &&
			this.#modelAllowed()
	);
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.#consent.translations()?.language)
	);
	/**
	 * Phone sheets take the prompt's resolved phone edge style, which the
	 * policy and a Card's own rule (always inset) have already settled.
	 *
	 * @internal
	 */
	protected readonly edgeStyle = computed(
		() =>
			resolveLegacyConsentPresentation({
				policy: this.#consent.snapshot().policyRule,
				presentation: this.#consent.presentation(),
				surface: 'prompt',
			}).container?.phone.edgeStyle ?? 'inset'
	);
	/** @internal */
	protected readonly copy = computed(() =>
		resolvePrivacyChoicesDialogCopy(this.#consent.copy(), { eu: this.eu() })
	);
	readonly #sale = computed(() => resolveSaleRight(this.#consent.snapshot()));
	/** @internal */
	protected readonly saleAvailable = computed(() =>
		hasSaleRight(this.#consent.snapshot())
	);
	/** @internal */
	protected readonly saleCategory = computed(() => this.#sale().category);
	/** @internal */
	protected readonly saleOn = computed(() => this.#sale().selected === 'allow');
	/** @internal */
	protected readonly usExclude = computed((): readonly AllConsentNames[] => {
		const category = this.saleCategory();
		return category ? [category] : [];
	});
	/** The GPC note replaces the intro, never both (LAY-04). @internal */
	protected readonly intro = computed(() => {
		const sale = this.#sale();
		const gpcLocked = sale.available && sale.lock === 'gpc-active';
		return !this.eu() && gpcLocked ? null : this.copy().intro;
	});
	/** @internal */
	protected readonly hasChanges = computed(
		() => this.#draft.state().hasEffectiveChanges
	);
	/** @internal */
	protected readonly preferencesOpen = linkedSignal(() => {
		// A closed dialog starts over: Preferences folded.
		this.isOpen();
		return false;
	});
	/** @internal */
	protected readonly preferencesCopy = computed(() => {
		const { displayedCategories, values } = this.#draft.state();
		const sale = this.saleCategory();
		const count = displayedCategories.filter(
			(name) => name !== 'necessary' && name !== sale && values[name]
		).length;
		return resolvePreferencesRowCopy(this.#consent.copy(), count);
	});
	/** @internal */
	protected readonly legal = computed(() => {
		const key = this.eu() ? 'cookiePolicy' : 'privacyPolicy';
		const allowed = this.legalLinks();
		const [legal] = resolveLegalLinkEntries(
			this.#consent.legalLinks(),
			allowed === undefined
				? [key]
				: (allowed?.filter((entry) => entry === key) ?? []),
			this.#consent.copy().legalLinks
		);
		return legal ?? null;
	});
	/** @internal */
	protected readonly rootPart = computed(() =>
		slotPart(
			'consentDialog',
			this.#theme.theme(),
			this.#noStyle(),
			styles.backdrop
		)
	);

	/** The sheet on top, kept for its exit while it animates out (NEST-03). */
	readonly #topSheet = computed(() => {
		const { sheets } = this.#surface.state();
		return sheets[sheets.length - 1] ?? null;
	});
	/**
	 * Nothing is left to animate under reduced motion, on desktop or in a
	 * closed dialog, so a sheet leaves at once there (NEST-06).
	 */
	readonly #exitsAtOnce = computed(
		() => this.#reducedMotion() || !this.phone() || !this.isOpen()
	);
	/** @internal */
	protected readonly shownSheet = linkedSignal<
		{ id: string | null; atOnce: boolean },
		ShownSheet | null
	>({
		computation: ({ atOnce, id }, previous) => {
			const shown = previous?.value ?? null;
			if (id !== null) {
				// A sheet reopened while it animates out shows again at once,
				// and its exit timer goes with the closing state (NEST-03).
				return shown?.id === id && !shown.closing
					? shown
					: { closing: false, id };
			}
			if (shown && (atOnce || !shown.closing)) {
				return atOnce ? null : { ...shown, closing: true };
			}
			return shown;
		},
		equal: (a, b) => a?.id === b?.id && a?.closing === b?.closing,
		source: () => ({
			atOnce: this.#exitsAtOnce(),
			id: this.#topSheet()?.id ?? null,
		}),
	});
	/** @internal */
	protected readonly sheetOpen = computed(() => {
		const sheet = this.shownSheet();
		return Boolean(sheet && !sheet.closing);
	});
	/** @internal */
	protected readonly vendorCategory = computed(() => {
		const id = this.shownSheet()?.id;
		return id?.startsWith(VENDOR_SHEET_PREFIX)
			? (id.slice(VENDOR_SHEET_PREFIX.length) as AllConsentNames)
			: null;
	});
	readonly #vendorCopy = computed(() => {
		const category = this.vendorCategory();
		return category
			? resolveVendorTableCopy(this.#consent.copy(), {
					category: resolveCategoryTitle(this.#consent.copy(), category),
					count: 0,
					onCount: 0,
					open: true,
				})
			: null;
	});
	/** @internal */
	protected readonly sheetTitle = computed(
		() => this.#vendorCopy()?.table ?? this.copy().preferencesTitle
	);
	/** @internal */
	protected readonly sheetIntro = computed(() =>
		this.vendorCategory()
			? this.copy().vendorSheetIntro
			: this.copy().preferencesIntro
	);
	/** @internal */
	protected readonly sheetCloseLabel = computed(
		() => this.#vendorCopy()?.close ?? this.copy().preferencesClose
	);
	/** @internal */
	protected readonly sheetStatus = computed(() => {
		const { announcement } = this.#surface.state();
		const sheet = this.shownSheet();
		return sheet && announcement && announcement.layer === sheet.id
			? announcementText(announcement)
			: '';
	});
	/** @internal */
	protected readonly mainStatus = computed(() => {
		const state = this.#surface.state();
		return state.announcement?.layer === MAIN_LAYER && state.sheets.length === 0
			? announcementText(state.announcement)
			: '';
	});

	/** The "Saved" cue beside Done, replayed on every change (SR-07, MOT-03). @internal */
	protected readonly cue = signal(0);
	#cueCount = 0;

	constructor() {
		effect(() => {
			this.#styles.ensure(
				PRIVACY_CHOICES_DIALOG_SHEETS,
				this.#noStyle(),
				SURFACE_SCOPES.dialog
			);
		});
		// Keep the draft in step with the dialog: unsaved EU edits are dropped
		// whenever it closes (EU-02).
		effect((onCleanup) => {
			const session = this.#surface.session();
			const draft = this.#draft.draft();
			onCleanup(session.attachDraft(draft));
		});
		// The cue goes after a moment, on a timer.
		effect((onCleanup) => {
			if (this.cue() === 0) {
				return;
			}
			const timer = setTimeout(() => this.cue.set(0), CUE_MS);
			onCleanup(() => clearTimeout(timer));
		});
		// A closing sheet animates out, then unmounts. The timer clears only
		// the exit it was set for, never a sheet shown since.
		effect((onCleanup) => {
			const exiting = this.shownSheet();
			if (!exiting?.closing) {
				return;
			}
			const timer = setTimeout(
				() =>
					this.shownSheet.update((current) =>
						current === exiting ? null : current
					),
				SHEET_EXIT_MS
			);
			onCleanup(() => clearTimeout(timer));
		});
		this.#followOpenRequest();
		this.#followControlledClose();
		// Desktop never nests, and a viewport change drops open sheets
		// (NEST-01, NEST-06).
		effect(() => {
			if (!this.phone() && this.#surface.state().sheets.length > 0) {
				untracked(() => this.#surface.session().popSheet());
			}
		});
		this.#followOpen();
		this.#followSheet();
		this.#followEscape();
		this.#followBackdrop();
		this.#followScroll();
	}

	/**
	 * A controlled `open` goes through the consent manager, so the session,
	 * sheets and Escape follow this dialog and the banner hands over to it.
	 * It asks once each time it turns true; Close and Escape then close the
	 * dialog as usual.
	 */
	#followOpenRequest(): void {
		let requested = false;
		effect(() => {
			if (this.open() !== true) {
				requested = false;
				return;
			}
			if (requested || !this.#consent.hasConsentUi() || !this.#modelAllowed()) {
				return;
			}
			requested = true;
			this.#claimed = true;
			untracked(() => {
				const kernel = this.#consent.kernel();
				if (kernel.getSnapshot().activeUI !== 'dialog') {
					showConsentSurface(kernel, 'dialog');
				}
			});
		});
	}

	/**
	 * Whether the consent manager's dialog is this one's: asked for by a
	 * controlled `open`, or shown. It is held from the request, not from the
	 * first render, so `open` turning false before the dialog shows closes
	 * it too, and the banner comes back.
	 */
	#claimed = false;

	/**
	 * A controlled `open` turning false closes the dialog it asked for or
	 * showed through the consent manager, as Close does, so an unanswered
	 * banner comes back and no sheet stays pushed under a hidden dialog. A
	 * dialog the consent manager opened while `open` was already false
	 * stays its own.
	 */
	#followControlledClose(): void {
		effect(() => {
			if (this.isOpen()) {
				this.#claimed = true;
			}
			if (this.#consent.activeUI() !== 'dialog') {
				this.#claimed = false;
				return;
			}
			if (this.open() !== false || !this.#claimed) {
				return;
			}
			this.#claimed = false;
			untracked(() => {
				const kernel = this.#consent.kernel();
				if (kernel.getSnapshot().activeUI !== 'dialog') {
					return;
				}
				showConsentSurface(kernel, 'none');
				if (kernel.getSnapshot().activeUI === 'banner') {
					focusReturningBanner();
				}
			});
		});
	}

	/**
	 * Open: the page is inert, focus moves to the title and is trapped in
	 * the top layer, and returns to the opener on close (FOC-01..03).
	 */
	#followOpen(): void {
		afterRenderEffect((onCleanup) => {
			const backdrop = this.backdrop()?.nativeElement;
			const main = this.mainLayer();
			if (!(this.isOpen() && backdrop && main)) {
				return;
			}
			untracked(() => {
				let opener: Element | null = document.activeElement;
				const kernel = this.#consent.kernel();
				const release = attachPageBlock(backdrop);
				// Back from an opt-out (after its revocation reload, or from a
				// one-click opt-out link), the dialog opens on the receipt that
				// confirms it.
				const receipt = takeReceiptFocus(kernel)
					? main
							.element()
							.querySelector<HTMLElement>(
								'[data-testid="consent-dialog-receipt"][data-open="true"]'
							)
					: null;
				const untrap = attachTopLayerTrap(main.element(), {
					initialFocus: receipt ?? main.heading(),
					returnFocus: () => {
						const target = opener;
						opener = null;
						// Closing without a decision brings the banner back; focus
						// moves to it once it renders (BNR-05, FOC-03).
						if (kernel.getSnapshot().activeUI === 'banner') {
							focusReturningBanner();
						}
						if (target instanceof HTMLElement && target.isConnected) {
							return target;
						}
						for (const selector of RETURN_TARGETS) {
							const fallback = document.querySelector<HTMLElement>(selector);
							if (fallback) {
								return fallback;
							}
						}
						return null;
					},
				});
				onCleanup(() => {
					// Release the page first: focus can't return to an inert opener.
					release();
					untrap();
				});
			});
		});
	}

	/**
	 * A sheet is the top layer while it shows: it holds focus, and closing
	 * it returns focus to the row that opened it (NEST-04).
	 */
	#followSheet(): void {
		afterRenderEffect((onCleanup) => {
			const sheet = this.sheetLayer();
			if (!(this.isOpen() && this.sheetOpen() && sheet)) {
				return;
			}
			untracked(() => {
				const { sheets } = this.#surface.session().getState();
				const openerKey = sheets[sheets.length - 1]?.opener ?? '';
				const main = this.mainLayer();
				onCleanup(
					attachTopLayerTrap(sheet.element(), {
						initialFocus: sheet.heading(),
						returnFocus: () =>
							main
								?.element()
								.querySelector<HTMLElement>(`[data-opener="${openerKey}"]`) ??
							main?.heading() ??
							null,
					})
				);
			});
		});
	}

	/** Escape: the top sheet, then an open confirmation, then the dialog (FOC-04). */
	#followEscape(): void {
		effect((onCleanup) => {
			if (!this.isOpen()) {
				return;
			}
			const session = this.#surface.session();
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key !== 'Escape' || event.defaultPrevented) {
					return;
				}
				const outcome = session.escape({ blocking: true, focusInside: true });
				if (outcome !== 'ignore') {
					event.preventDefault();
				}
				if (outcome === 'close-dialog' && this.open() !== undefined) {
					this.openChange.emit(false);
				}
			};
			document.addEventListener('keydown', onKeyDown);
			onCleanup(() => document.removeEventListener('keydown', onKeyDown));
		});
	}

	/**
	 * A tap on the dimmed parent closes only the sheet, and the tap's click
	 * never lands on what is under it (NEST-04, NEST-05).
	 */
	#followBackdrop(): void {
		afterRenderEffect((onCleanup) => {
			const backdrop = this.backdrop()?.nativeElement;
			if (!(this.isOpen() && backdrop)) {
				return;
			}
			untracked(() => {
				const session = this.#surface.session();
				onCleanup(
					attachBackdropGuard(backdrop, {
						isBackdrop: (target) =>
							session.getState().sheets.length > 0 &&
							!(this.sheetLayer()?.element().contains(target) ?? false),
						onBackdrop: () => {
							session.popSheet();
						},
					})
				);
			});
		});
	}

	/** Scroll-edge fades on each body (LAY-08), and the Preferences reveal (LAY-05). */
	#followScroll(): void {
		afterRenderEffect((onCleanup) => {
			const main = this.mainLayer();
			if (!(this.isOpen() && main)) {
				return;
			}
			const fades = attachScrollFades(main.body());
			onCleanup(() => fades());
		});
		afterRenderEffect((onCleanup) => {
			const sheet = this.sheetLayer();
			if (!(this.isOpen() && this.shownSheet() && sheet)) {
				return;
			}
			const fades = attachScrollFades(sheet.body());
			onCleanup(() => fades());
		});
		afterRenderEffect((onCleanup) => {
			const main = this.mainLayer();
			if (!(this.isOpen() && this.preferencesOpen() && main)) {
				return;
			}
			untracked(() => {
				const session = this.#surface.session();
				const { token } = session.getState();
				onCleanup(
					scheduleReveal(
						() => {
							const body = main.body();
							const trigger = body.querySelector<HTMLElement>(
								'[data-testid="consent-dialog-preferences-row"]'
							);
							const panel = body.querySelector<HTMLElement>(
								'[data-testid="consent-dialog-preferences-panel"]'
							);
							if (trigger && panel) {
								revealDisclosure(trigger, panel, { body });
							}
						},
						{ isCurrent: () => session.isCurrent(token) }
					)
				);
			});
		});
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

	/** One key while the cue shows, a new one per change, so it replays. @internal */
	protected cueKeys(cue: number): readonly number[] {
		return cue > 0 ? [cue] : [];
	}

	/** @internal */
	protected showCue(): void {
		this.#cueCount += 1;
		this.cue.set(this.#cueCount);
	}

	/** @internal */
	protected close(): void {
		showConsentSurface(this.#consent.kernel(), 'none');
		if (this.open() !== undefined) {
			this.openChange.emit(false);
		}
	}

	/** @internal */
	protected popSheet(): void {
		this.#surface.session().popSheet();
	}

	/** @internal */
	protected preferencesClick(): void {
		if (this.phone()) {
			this.#surface.session().pushSheet(PREFERENCES_SHEET, PREFERENCES_OPENER);
		} else {
			this.preferencesOpen.update((open) => !open);
		}
	}

	/** @internal */
	protected openVendors(request: OpenVendorsRequest): void {
		this.#surface
			.session()
			.pushSheet(`${VENDOR_SHEET_PREFIX}${request.category}`, request.opener);
	}

	/** @internal */
	protected commit(action: BannerCommitAction): void {
		commitDialogChoice(this.#consent.kernel(), action, {
			draft: this.#draft.draft(),
			uiSource: 'dialog',
		});
		if (this.open() !== undefined) {
			this.openChange.emit(false);
		}
	}
}
