<script setup lang="ts">
/**
 * The consent dialog ("Your Privacy Choices"): one column whose body is the
 * only scroller, the statutory rights on its first view, the receipt, and
 * Preferences; in the EU, the cookie categories and a staged Save. On
 * phone, Preferences and EU vendor lists open as nested sheets, at most
 * two layers; desktop uses accordions only.
 *
 * It loads on open, with its stylesheets: the theme's buttons, the scroll
 * area and group it shares with the banner panels, then its own rules.
 */
import {
	commitDialogChoice,
	MAIN_LAYER,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type {
	AllConsentNames,
	BannerCommitAction,
	SaveUISource,
} from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import { showConsentSurface } from '@inth/sdk/surface-actions';
import {
	announcementText,
	resolveCategoryTitle,
	resolveConsentPresentation,
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

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { getTextDirection, resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import { prefersReducedMotion } from '@inth/sdk/ui/utils/reduced-motion';
import {
	computed,
	mergeProps,
	onBeforeUnmount,
	onMounted,
	ref,
	Teleport,
	useId,
	watch,
} from 'vue';

import { useConsentConfig } from '../../composables/config';
import { useResolvedPresentation } from '../../composables/use-experiment';
import { useConsentInit } from '../../composables/use-consent-init';
import {
	useConsentKernel,
	useConsentSnapshot,
	useHasConsentUi,
} from '../../composables/use-consent-kernel';
import { useMounted } from '../../composables/use-mounted';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import AdvertisingRow from '../parts/advertising-row.vue';
import CategoryGroup from '../parts/category-group.vue';
import ChoiceButton from '../parts/choice-button.vue';
import { provideChoiceDraft } from '../parts/use-choice-draft';
import { takeReceiptFocus } from '../parts/receipt-focus';
import RightsReceipt from '../parts/receipt.vue';
import SaleRightsRow from '../parts/rights-row.vue';
import { usePhoneLayout } from '../parts/use-phone-layout';
import { useSurfaceSession } from '../parts/use-surface-session';
import DoneButton from './done-button.vue';
import Layer from './layer.vue';

/** The "Saved" cue stays this long, on a timer, not an animation (MOT-03). */
const CUE_MS = 1700;
/** A closing sheet animates out this long, inert (NEST-03). */
const SHEET_EXIT_MS = 160;
/** The opener key of the Preferences row. */
const PREFERENCES_OPENER = 'preferences';
const PREFERENCES_SHEET = 'preferences';
const VENDOR_SHEET_PREFIX = 'vendors:';
const SAVE_SOURCES = new Set(['banner', 'dialog', 'widget', 'none']);
/** How many frames to wait for a returning banner, which may still be loading. */
const BANNER_RETURN_FRAMES = 60;
/**
 * Where focus goes when the dialog's opener is gone (FOC-03): "Your
 * Privacy Choices", the floating trigger, then Vue's `ConsentDialogLink`.
 */
const RETURN_TARGETS = [
	'[data-testid="privacy-choices-link"]',
	'[data-testid="consent-dialog-trigger"]',
	'[data-testid="consent-dialog-link"]',
];

const props = withDefaults(
	defineProps<{
		/** Skip the sheet exits. Defaults to the config's. */
		disableAnimation?: boolean;
		/**
		 * Control the open state. `true` asks the consent manager to show
		 * the dialog, so the banner leaves and sheets, Escape and the
		 * receipt work as for any open dialog; Close and Escape then close
		 * it through the consent manager, and `open` must turn `false` and
		 * back to `true` to ask again. `false` hides it whatever the
		 * consent manager shows. Omitted, it follows `activeUI === 'dialog'`.
		 */
		open?: boolean;
		models?: string[];
		uiSource?: string;
	}>(),
	{
		disableAnimation: undefined,
		models: undefined,
		open: undefined,
		uiSource: undefined,
	}
);

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const config = useConsentConfig();
const hasConsentUi = useHasConsentUi();
const translations = useSurfaceTranslations();
const init = useConsentInit();
const textDirection = computed(() =>
	getTextDirection(init.value?.translations?.language)
);
const presentation = useResolvedPresentation();
const { session, state } = useSurfaceSession();
const { draft, state: draftState } = provideChoiceDraft();
const phone = usePhoneLayout();
const mounted = useMounted();
const prefix = `inth-pcd-${useId().replace(/:/gu, '')}`;
const disableAnimation = computed(() =>
	Boolean(props.disableAnimation ?? config.value.disableAnimation)
);
// `disableAnimation` reads as reduced motion, so a closing sheet leaves at
// once.
const reducedMotion = computed(
	() => disableAnimation.value || prefersReducedMotion()
);

type LayerInstance = {
	element: HTMLElement | null;
	title: HTMLElement | null;
	body: HTMLElement | null;
} | null;
const backdropRef = ref<HTMLElement | null>(null);
const mainRef = ref<LayerInstance>(null);
const sheetRef = ref<LayerInstance>(null);
const preferencesTriggerRef = ref<HTMLElement | null>(null);
const preferencesPanelRef = ref<HTMLElement | null>(null);
let opener: Element | null = null;

// The model and the US markers decide the body, never the prompt: an EU
// opt-in policy that shows no banner still gets the EU dialog.
const eu = computed(
	() => resolvePrivacyChoicesRegime(snapshot.value.policyRule) === 'eu'
);
const activeUI = computed(() => snapshot.value.activeUI ?? 'none');
const modelAllowed = computed(() => {
	const model =
		snapshot.value.resolution.status === 'matched'
			? snapshot.value.model
			: null;
	return !props.models || model === null || props.models.includes(model);
});
// A controlled `open` goes through the consent manager, so the session,
// sheets and Escape follow this dialog and the banner hands over to it. It
// asks once each time it turns true; Close and Escape then close the
// dialog as usual.
let openRequested = false;
watch(
	[() => props.open, hasConsentUi, modelAllowed],
	() => {
		if (props.open !== true) {
			openRequested = false;
			return;
		}
		if (openRequested || !hasConsentUi.value || !modelAllowed.value) {
			return;
		}
		openRequested = true;
		if (kernel.getSnapshot().activeUI !== 'dialog') {
			showConsentSurface(kernel, 'dialog');
		}
	},
	{ immediate: true }
);
const open = computed(
	() =>
		props.open !== false &&
		activeUI.value === 'dialog' &&
		hasConsentUi.value &&
		modelAllowed.value
);
// Phone sheets take the prompt's resolved phone edge style, which the
// policy and a Card's own rule (always inset) have already settled.
const edgeStyle = computed(
	() =>
		resolveConsentPresentation({
			policy: snapshot.value.policyRule,
			presentation: presentation.value,
			surface: 'prompt',
		}).container?.phone.edgeStyle ?? 'inset'
);
const saveSource = computed<SaveUISource | undefined>(() => {
	const value = props.uiSource ?? 'dialog';
	return SAVE_SOURCES.has(value) ? (value as SaveUISource) : undefined;
});
const copy = computed(() =>
	resolvePrivacyChoicesDialogCopy(translations.value, { eu: eu.value })
);
const sale = computed(() => resolveSaleRight(snapshot.value));
const gpcLocked = computed(
	() => sale.value.available && sale.value.lock === 'gpc-active'
);

// The "Saved" cue beside Done, replayed on every change (SR-07, MOT-03).
const cue = ref(0);
let cueCount = 0;
const showCue = () => {
	cueCount += 1;
	cue.value = cueCount;
};
watch(cue, (value, _previous, onCleanup) => {
	if (value === 0) {
		return;
	}
	const timer = setTimeout(() => {
		cue.value = 0;
	}, CUE_MS);
	onCleanup(() => clearTimeout(timer));
});

// The sheet on top, kept for its exit while it animates out (NEST-03).
const shownSheet = ref<{ id: string; closing: boolean } | null>(null);
// Nothing is left to animate under reduced motion, on desktop or in a
// closed dialog, so a sheet leaves at once there (NEST-06).
const exitsAtOnce = computed(
	() => reducedMotion.value || !phone.value || !open.value
);
watch(
	[
		() => state.value.sheets[state.value.sheets.length - 1] ?? null,
		exitsAtOnce,
	],
	([topSheet, atOnce]) => {
		const shown = shownSheet.value;
		if (topSheet && (shown?.id !== topSheet.id || shown.closing)) {
			// A sheet reopened while it animates out shows again at once,
			// and its exit timer goes with the closing state (NEST-03).
			shownSheet.value = { closing: false, id: topSheet.id };
		} else if (!topSheet && shown && (atOnce || !shown.closing)) {
			shownSheet.value = atOnce ? null : { ...shown, closing: true };
		}
	},
	{ flush: 'sync', immediate: true }
);
watch(shownSheet, (sheet, _previous, onCleanup) => {
	if (!sheet?.closing) {
		return;
	}
	// Clears only the exit it was set for, never a sheet shown since.
	const timer = setTimeout(() => {
		if (shownSheet.value === sheet) {
			shownSheet.value = null;
		}
	}, SHEET_EXIT_MS);
	onCleanup(() => clearTimeout(timer));
});
const sheetOpen = computed(() =>
	Boolean(shownSheet.value && !shownSheet.value.closing)
);

// Keep the draft in step with the dialog: unsaved EU edits are dropped
// whenever it closes (EU-02).
let detachDraft: (() => void) | undefined;
onMounted(() => {
	detachDraft = session.attachDraft(draft);
});
onBeforeUnmount(() => detachDraft?.());

// Desktop never nests, and a viewport change drops open sheets
// (NEST-01, NEST-06).
watch([phone, () => state.value.sheets.length], ([isPhone, count]) => {
	if (!isPhone && count > 0) {
		session.popSheet();
	}
});

/** The frame a returning banner waits on, cancelled on unmount. */
let bannerFrame = 0;
onBeforeUnmount(() => cancelAnimationFrame(bannerFrame));
/** Focus the banner card once it renders again. */
const focusReturningBanner = () => {
	cancelAnimationFrame(bannerFrame);
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
			bannerFrame = requestAnimationFrame(attempt);
		}
	};
	bannerFrame = requestAnimationFrame(attempt);
};

// A controlled `open` turning false closes a shown dialog through the
// consent manager, as Close does, so an unanswered banner comes back, with
// focus, and no sheet stays pushed under a hidden dialog.
watch(open, (isOpen, wasOpen) => {
	if (
		isOpen ||
		!wasOpen ||
		props.open !== false ||
		kernel.getSnapshot().activeUI !== 'dialog'
	) {
		return;
	}
	showConsentSurface(kernel, 'none');
	if (kernel.getSnapshot().activeUI === 'banner') {
		focusReturningBanner();
	}
});

// Open: the page is inert, focus moves to the title and is trapped in the
// top layer, and returns to the opener on close (FOC-01..03).
watch(
	[open, mounted],
	(_value, _previous, onCleanup) => {
		const backdrop = backdropRef.value;
		const main = mainRef.value?.element;
		// Not before the teleport has moved the dialog: the receipt request
		// would be spent on the node it leaves (FOC-01).
		if (!(open.value && mounted.value && backdrop && main)) {
			return;
		}
		opener = document.activeElement;
		const release = attachPageBlock(backdrop);
		// Back from an opt-out (after its revocation reload, or from a
		// one-click opt-out link), the dialog opens on the receipt that
		// confirms it.
		const receipt = takeReceiptFocus(kernel)
			? main.querySelector<HTMLElement>(
					'[data-testid="consent-dialog-receipt"][data-open="true"]'
				)
			: null;
		const untrap = attachTopLayerTrap(main, {
			initialFocus: receipt ?? mainRef.value?.title ?? null,
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
	},
	{ flush: 'post', immediate: true }
);

// A sheet is the top layer while it shows: it holds focus, and closing it
// returns focus to the row that opened it (NEST-04).
watch(
	[open, sheetOpen],
	(_value, _previous, onCleanup) => {
		const sheet = sheetRef.value?.element;
		if (!(open.value && sheetOpen.value && sheet)) {
			return;
		}
		const { sheets } = session.getState();
		const openerKey = sheets[sheets.length - 1]?.opener ?? '';
		onCleanup(
			attachTopLayerTrap(sheet, {
				initialFocus: sheetRef.value?.title ?? null,
				returnFocus: () =>
					mainRef.value?.element?.querySelector<HTMLElement>(
						`[data-opener="${openerKey}"]`
					) ??
					mainRef.value?.title ??
					null,
			})
		);
	},
	{ flush: 'post' }
);

// Escape: the top sheet, then an open confirmation, then the dialog
// (FOC-04).
const onKeyDown = (event: KeyboardEvent) => {
	if (event.key !== 'Escape' || event.defaultPrevented) {
		return;
	}
	const outcome = session.escape({ blocking: true, focusInside: true });
	if (outcome !== 'ignore') {
		event.preventDefault();
	}
};
watch(
	open,
	(value, _previous, onCleanup) => {
		if (!value || typeof document === 'undefined') {
			return;
		}
		document.addEventListener('keydown', onKeyDown);
		onCleanup(() => document.removeEventListener('keydown', onKeyDown));
	},
	{ immediate: true }
);

// A tap on the dimmed parent closes only the sheet, and the tap's click
// never lands on what is under it (NEST-04, NEST-05).
watch(
	[open, mounted],
	(_value, _previous, onCleanup) => {
		const backdrop = backdropRef.value;
		if (!(open.value && backdrop)) {
			return;
		}
		onCleanup(
			attachBackdropGuard(backdrop, {
				isBackdrop: (target) =>
					session.getState().sheets.length > 0 &&
					!(sheetRef.value?.element?.contains(target) ?? false),
				onBackdrop: () => {
					session.popSheet();
				},
			})
		);
	},
	{ flush: 'post', immediate: true }
);

// Scroll-edge fades on each body (LAY-08).
watch(
	[open, mounted],
	(_value, _previous, onCleanup) => {
		const body = mainRef.value?.body;
		if (open.value && body) {
			onCleanup(attachScrollFades(body));
		}
	},
	{ flush: 'post', immediate: true }
);
watch(
	[open, shownSheet],
	(_value, _previous, onCleanup) => {
		const body = sheetRef.value?.body;
		if (open.value && shownSheet.value && body) {
			onCleanup(attachScrollFades(body));
		}
	},
	{ flush: 'post' }
);

// Opening Preferences reveals as much of it as fits without scrolling its
// row out (LAY-05). A closed dialog starts over: Preferences folded.
const preferencesOpen = ref(false);
watch(
	[open, preferencesOpen],
	(_value, _previous, onCleanup) => {
		if (!open.value) {
			preferencesOpen.value = false;
			return;
		}
		if (!preferencesOpen.value) {
			return;
		}
		const { token } = session.getState();
		onCleanup(
			scheduleReveal(
				() => {
					const trigger = preferencesTriggerRef.value;
					const panel = preferencesPanelRef.value;
					if (trigger && panel) {
						revealDisclosure(trigger, panel, {
							body: mainRef.value?.body ?? null,
						});
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			)
		);
	},
	{ flush: 'post' }
);

const close = () => showConsentSurface(kernel, 'none');
const popSheet = () => {
	session.popSheet();
};
const pushSheet = (sheet: string, openerKey: string) => {
	session.pushSheet(sheet, openerKey);
};
const commit = (action: BannerCommitAction) => {
	commitDialogChoice(kernel, action, { draft, uiSource: saveSource.value });
};
const onPreferencesRow = () => {
	if (phone.value) {
		pushSheet(PREFERENCES_SHEET, PREFERENCES_OPENER);
	} else {
		preferencesOpen.value = !preferencesOpen.value;
	}
};

const legal = computed(() => {
	const key = eu.value ? 'cookiePolicy' : 'privacyPolicy';
	return resolveLegalLinkEntries(
		config.value.legalLinks,
		[key],
		translations.value.legalLinks
	)[0];
});
const saleCategory = computed(() => sale.value.category);
const usExclude = computed<AllConsentNames[]>(() =>
	saleCategory.value ? [saleCategory.value] : []
);
const preferencesCopy = computed(() =>
	resolvePreferencesRowCopy(
		translations.value,
		draftState.value.displayedCategories.filter(
			(name) =>
				name !== 'necessary' &&
				name !== saleCategory.value &&
				draftState.value.values[name]
		).length
	)
);
const preferencesPanelId = `${prefix}-preferences`;

/**
 * The root is the backdrop and the dialog's surface: `dialog.root` and
 * the `consentDialog` slot (`dialog.container`) both style it, and either
 * one's `noStyle` drops the stock backdrop class.
 */
// The root is the backdrop and the dialog's surface. `dialog.root` and
// the `consentDialog` theme slot (`dialog.container`) both style it, and
// either one's `noStyle` drops the stock backdrop. `dialog.overlay`, which
// styled the backdrop element of earlier releases, styles it too.
const rootAttrs = computed(() => {
	type Part = { noStyle?: unknown } | undefined;
	const root = config.value.components?.dialog?.root as Part;
	const container = config.value.components?.dialog?.container as Part;
	const overlay = config.value.components?.dialog?.overlay as Part;
	const noStyle =
		root?.noStyle === true ||
		container?.noStyle === true ||
		overlay?.noStyle === true;
	return mergeProps(
		slotAttrs(root, noStyle ? undefined : styles.backdrop),
		slotAttrs(overlay),
		slotAttrs(container)
	);
});

// The phone sheet on top: Preferences in the US, a category's vendors in
// the EU. Its ids carry their own prefix (SR-05).
const sheetPrefix = `${prefix}-sheet`;
const vendorCategory = computed(() =>
	shownSheet.value?.id.startsWith(VENDOR_SHEET_PREFIX)
		? (shownSheet.value.id.slice(VENDOR_SHEET_PREFIX.length) as AllConsentNames)
		: null
);
const sheetTitles = computed(() => {
	const category = vendorCategory.value;
	if (!category) {
		return {
			close: copy.value.preferencesClose,
			intro: copy.value.preferencesIntro,
			title: copy.value.preferencesTitle,
		};
	}
	const vendorCopy = resolveVendorTableCopy(translations.value, {
		category: resolveCategoryTitle(translations.value, category),
		count: 0,
		onCount: 0,
		open: true,
	});
	return {
		close: vendorCopy.close,
		intro: copy.value.vendorSheetIntro,
		title: vendorCopy.table,
	};
});
const sheetStatus = computed(() =>
	state.value.announcement &&
	state.value.announcement.layer === shownSheet.value?.id
		? announcementText(state.value.announcement)
		: ''
);
const mainStatus = computed(() =>
	state.value.announcement?.layer === MAIN_LAYER &&
	state.value.sheets.length === 0
		? announcementText(state.value.announcement)
		: ''
);
// The GPC note replaces the intro, never both (LAY-04).
const intro = computed(() =>
	!eu.value && gpcLocked.value ? null : copy.value.intro
);
</script>

<template>
	<Teleport
		to="body"
		:disabled="!mounted"
	>
		<div
			v-if="open"
			ref="backdropRef"
			v-bind="rootAttrs"
			:[SURFACE_ROOT_ATTRIBUTE]="'dialog'"
			:data-animation="disableAnimation ? 'off' : undefined"
			:data-edge-style="edgeStyle"
			:data-regime="eu ? 'eu' : 'us'"
			:data-layout="phone ? 'phone' : 'desktop'"
			data-testid="consent-dialog-root"
			:dir="textDirection"
		>
			<Layer
				ref="mainRef"
				:id-prefix="`${prefix}-main`"
				:title="copy.title"
				:intro="intro"
				:close-label="copy.close"
				:status="mainStatus"
				:nested="false"
				:top="!sheetOpen"
				:depth="sheetOpen ? 1 : 0"
				:eu="eu"
				:part="config.components?.dialog?.card"
				@close="close"
			>
				<CategoryGroup
					v-if="eu"
					:id-prefix="`${prefix}-main`"
					test-id-prefix="consent-dialog"
					:vendors="phone ? 'sheet' : 'accordion'"
					:part="config.components?.dialog?.categoryGroup"
					:vendor-table-part="config.components?.dialog?.vendorTable"
					@open-vendors="
						(category, openerKey) =>
							pushSheet(`${VENDOR_SHEET_PREFIX}${category}`, openerKey)
					"
				/>
				<template v-else>
					<SaleRightsRow
						:id-prefix="`${prefix}-main`"
						test-id-prefix="consent-dialog"
						:ui-source="saveSource"
						:part="config.components?.dialog?.rightsRow"
						@recorded="showCue"
					/>
					<RightsReceipt
						:id-prefix="`${prefix}-main`"
						:part="config.components?.dialog?.receipt"
					/>
					<button
						ref="preferencesTriggerRef"
						type="button"
						v-bind="
							slotAttrs(
								config.components?.dialog?.preferencesRow,
								styles.navRow
							)
						"
						:aria-expanded="phone ? undefined : preferencesOpen"
						:aria-controls="phone ? undefined : preferencesPanelId"
						:aria-haspopup="phone ? 'dialog' : undefined"
						:data-opener="PREFERENCES_OPENER"
						data-testid="consent-dialog-preferences-row"
						@click="onPreferencesRow"
					>
						<span :class="styles.navRowLabel"
							>{{ preferencesCopy.title
							}}<span :class="styles.navRowMeta"
								>{{ preferencesCopy.summary }} ·
								{{ preferencesCopy.onCount }}</span
							></span
						>
						<span
							:class="styles.chevron"
							:data-direction="phone ? 'end' : 'down'"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path :d="phone ? 'm9 6 6 6-6 6' : 'm6 9 6 6 6-6'" />
							</svg>
						</span>
					</button>
					<div
						v-if="!phone"
						ref="preferencesPanelRef"
						:class="styles.disclosure"
						:id="preferencesPanelId"
						:data-open="preferencesOpen"
						:inert="!preferencesOpen || undefined"
						data-testid="consent-dialog-preferences-panel"
					>
						<div :class="styles.disclosureInner">
							<div :class="styles.preferencesPanel">
								<CategoryGroup
									:id-prefix="`${prefix}-main`"
									test-id-prefix="consent-dialog"
									:exclude="usExclude"
									apply="immediate"
									:ui-source="saveSource"
									vendors="accordion"
									:part="config.components?.dialog?.categoryGroup"
									:vendor-table-part="config.components?.dialog?.vendorTable"
									@applied="showCue"
								>
									<template #footer>
										<AdvertisingRow
											v-if="sale.available"
											:on="sale.selected === 'allow'"
											:id-prefix="prefix"
											test-id="consent-dialog-advertising-row"
										/>
									</template>
								</CategoryGroup>
							</div>
						</div>
					</div>
				</template>
				<template #footer>
					<a
						v-if="legal"
						:class="styles.quietLink"
						:href="legal.href"
						:target="legal.target"
						:rel="legal.rel"
						:data-testid="
							eu
								? 'consent-dialog-legal-link-cookiePolicy'
								: 'consent-dialog-legal-link-privacyPolicy'
						"
						>{{ legal.label }}</a
					>
					<span v-else />
					<div
						v-if="eu"
						:class="styles.footerActions"
					>
						<ChoiceButton
							consent-action="reject"
							variant="neutral"
							mode="stroke"
							data-testid="consent-dialog-reject-all"
							@click="commit('refuse')"
						>
							{{ copy.rejectAll }}
						</ChoiceButton>
						<ChoiceButton
							consent-action="accept"
							variant="neutral"
							mode="stroke"
							data-testid="consent-dialog-accept-all"
							@click="commit('allow')"
						>
							{{ copy.acceptAll }}
						</ChoiceButton>
						<!-- Enabled only once what would run differs from the record (EU-03). -->
						<ChoiceButton
							consent-action="save"
							is-primary
							:part="config.components?.dialog?.saveButton"
							:disabled="!draftState.hasEffectiveChanges"
							data-testid="consent-dialog-save-button"
							@click="commit('save')"
						>
							{{ copy.save }}
						</ChoiceButton>
					</div>
					<div
						v-else
						:class="styles.footerActions"
					>
						<DoneButton
							:cue="shownSheet ? 0 : cue"
							:label="copy.done"
							:cue-label="copy.savedCue"
							test-id="consent-dialog-done"
							@click="close"
						/>
					</div>
				</template>
			</Layer>
			<Layer
				v-if="shownSheet"
				ref="sheetRef"
				:id-prefix="sheetPrefix"
				:title="sheetTitles.title"
				:intro="sheetTitles.intro"
				:close-label="sheetTitles.close"
				:status="sheetStatus"
				:nested="true"
				:top="true"
				:closing="shownSheet.closing"
				:depth="0"
				:eu="eu"
				:sheet-id="shownSheet.id"
				:part="config.components?.dialog?.sheet"
				@close="popSheet"
			>
				<CategoryGroup
					v-if="vendorCategory"
					:id-prefix="sheetPrefix"
					test-id-prefix="consent-dialog"
					:only="vendorCategory"
					vendors="inline"
					:part="config.components?.dialog?.categoryGroup"
					:vendor-table-part="config.components?.dialog?.vendorTable"
				/>
				<CategoryGroup
					v-else
					:id-prefix="sheetPrefix"
					test-id-prefix="consent-dialog"
					:exclude="usExclude"
					apply="immediate"
					:ui-source="saveSource"
					vendors="accordion"
					:part="config.components?.dialog?.categoryGroup"
					:vendor-table-part="config.components?.dialog?.vendorTable"
					@applied="showCue"
				>
					<template #footer>
						<AdvertisingRow
							v-if="sale.available"
							:on="sale.selected === 'allow'"
							:id-prefix="prefix"
							test-id="consent-dialog-advertising-row"
						/>
					</template>
				</CategoryGroup>
				<template #footer>
					<span :class="styles.footerNote">{{ copy.sheetNote }}</span>
					<div :class="styles.footerActions">
						<DoneButton
							:cue="eu ? 0 : cue"
							:label="copy.done"
							:cue-label="copy.savedCue"
							test-id="consent-dialog-sheet-done"
							@click="popSheet"
						/>
					</div>
				</template>
			</Layer>
		</div>
	</Teleport>
</template>
