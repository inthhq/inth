<script setup lang="ts">
/**
 * The statutory rights row: a segmented control for selling, sharing and
 * targeted ads, the confirmation that opting back in needs, and the GPC
 * note. Shared by the Privacy Choices banner panels and the dialog.
 */
import {
	confirmSaleRight,
	pressSaleRight,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type { RightOption, SaveUISource } from '@inth/sdk/engine';
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
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';

import '@inth/sdk/ui/styles/components/consent-expand.css';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';

import '@inth/sdk/ui/styles/components/privacy-choices.css';
import { computed, ref, watch } from 'vue';

import { useConsentKernel, useConsentSnapshot } from '../../composables/kernel';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import ChoiceButton from './choice-button.vue';
import {
	rightsBundleOf,
	useOptOutReceiptData,
	useSurfaceSession,
} from './use-surface-session';

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
} as const;

const OPTIONS: readonly RightOption[] = ['protect', 'allow'];

/**
 * The sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04). Refusing applies in
 * one press; allowing a refusal, or any grant under opt-in, opens the
 * confirmation in place and records nothing until the visitor confirms
 * (LAW-02). Pressing Allow again while it is open nudges (RIGHT-04).
 *
 * Renders nothing when the policy has no category that decides sale.
 */
const props = defineProps<{
	/**
	 * Prefix for the row's element ids. Each layer that renders the row
	 * passes its own, so `aria-labelledby` never resolves into another
	 * layer (SR-05).
	 */
	idPrefix: string;
	/** The surface it renders on, which prefixes its test ids. */
	testIdPrefix: keyof typeof ROW_TEST_IDS;
	/** The site's name for `{business}`. */
	business?: string;
	/** Surface the recorded choice is attributed to. */
	uiSource?: SaveUISource;
	/** The `components` part that styles the row. */
	part?: object;
}>();

const emit = defineEmits<{
	/** After the row recorded a choice, for the dialog's "Saved" cue. */
	recorded: [];
}>();

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const translations = useSurfaceTranslations();
const { session, state } = useSurfaceSession();
const right = computed(() => resolveSaleRight(snapshot.value));
const confirmRef = ref<HTMLElement | null>(null);
const cancelRef = ref<InstanceType<typeof ChoiceButton> | null>(null);
const allowRef = ref<HTMLButtonElement | null>(null);
const open = computed(() => state.value.confirmation?.right === 'sale');
const nudges = computed(() =>
	open.value ? (state.value.confirmation?.nudges ?? 0) : 0
);

const focusCancel = () =>
	cancelRef.value?.element?.focus({ preventScroll: true });

// Focus follows the confirmation: Cancel when it opens (RIGHT-06), the
// invoking Allow when it closes from inside it.
watch(
	open,
	(now, was, onCleanup) => {
		const confirm = confirmRef.value;
		if (now && !was) {
			focusCancel();
			// Bring the question into view in the scroll body only, once it
			// has started to open, unless the surface moved on (RIGHT-07,
			// LAY-05, PERM-16).
			const { token } = session.getState();
			onCleanup(
				scheduleReveal(
					() => {
						if (confirm) {
							revealInScrollBody(confirm);
						}
					},
					{ isCurrent: () => session.isCurrent(token) }
				)
			);
		} else if (
			!now &&
			was &&
			confirm &&
			(confirm.contains(document.activeElement) ||
				document.activeElement === document.body)
		) {
			allowRef.value?.focus({ preventScroll: true });
		}
	},
	{ flush: 'post' }
);

// Replay the shake on every nudge; the red ring stays until it closes.
watch(
	nudges,
	(count) => {
		const confirm = confirmRef.value;
		if (!confirm || count === 0) {
			return;
		}
		confirm.dataset.nudged = 'false';
		void confirm.offsetWidth;
		confirm.dataset.nudged = 'true';
		focusCancel();
	},
	{ flush: 'post' }
);

const receiptData = useOptOutReceiptData();
const bundle = computed(() =>
	rightsBundleOf(snapshot.value, receiptData.value)
);
const model = computed(() => snapshot.value.evaluationPolicy.model);
const copy = computed(() =>
	resolveSaleRightCopy(translations.value, {
		bundle: bundle.value,
		business: props.business,
		locked: right.value.locked,
		model: model.value,
		selected: right.value.selected,
		source: right.value.source,
	})
);
const testIds = computed(() => ROW_TEST_IDS[props.testIdPrefix]);
const ids = computed(() => ({
	cancel: `${props.idPrefix}-sale-confirm-cancel`,
	confirmDescription: `${props.idPrefix}-sale-confirm-description`,
	confirmTitle: `${props.idPrefix}-sale-confirm-title`,
	description: `${props.idPrefix}-sale-description`,
	panel: `${props.idPrefix}-sale-confirm`,
	title: `${props.idPrefix}-sale-title`,
}));

/** Say what was recorded, ending in "Saved." (LAW-04). */
const recorded = (outcome: SaleAnnouncementOutcome) => {
	session.announce(
		resolveSaleAnnouncement(translations.value, {
			bundle: bundle.value,
			model: model.value,
			outcome,
		})
	);
	emit('recorded');
};
const press = (option: RightOption) => {
	const { outcome } = pressSaleRight(kernel, option, {
		uiSource: props.uiSource,
	});
	if (outcome === 'nudge') {
		session.announce(resolvePrivacyChoicesCopy(translations.value).nudge);
	} else if (outcome === 'apply-protect') {
		recorded('protect');
	} else if (outcome === 'apply-allow') {
		recorded('allow');
	} else if (outcome === 'record-default') {
		recorded('recorded');
	}
};
const confirmAllow = () => {
	if (confirmSaleRight(kernel, { uiSource: props.uiSource })) {
		recorded('allow');
	}
};
const setAllowRef = (option: RightOption) =>
	option === 'allow'
		? (element: unknown) => {
				allowRef.value = element as HTMLButtonElement | null;
			}
		: undefined;
</script>

<template>
	<section
		v-if="right.available && right.category !== null"
		v-bind="slotAttrs(part, styles.right)"
		:aria-labelledby="ids.title"
		:data-testid="testIds.row"
	>
		<div>
			<h3
				:class="styles.rightTitle"
				:id="ids.title"
			>
				{{ copy.title }}
			</h3>
			<p
				v-if="!right.locked"
				:class="styles.rightDescription"
				:id="ids.description"
			>
				{{ copy.description }}
			</p>
		</div>
		<div
			v-if="right.locked"
			:class="styles.note"
			:id="ids.description"
		>
			<span>{{ copy.description }}</span>
		</div>
		<!-- Pressed buttons in a group, never radios (RIGHT-01); a fieldset would bring its own border and legend. -->
		<div
			:class="styles.segmented"
			role="group"
			:aria-label="copy.groupLabel"
			:aria-describedby="ids.description"
			:data-selected="right.selected === 'protect' ? '0' : '1'"
		>
			<span
				:class="styles.segmentedThumb"
				aria-hidden="true"
			/>
			<button
				v-for="option in OPTIONS"
				:key="option"
				:ref="setAllowRef(option)"
				type="button"
				:class="styles.segmentedOption"
				:aria-pressed="right.selected === option"
				:aria-disabled="
					right.locked && right.selected !== option ? true : undefined
				"
				:data-right-option="option"
				:data-testid="testIds[option]"
				@click="press(option)"
			>
				<span
					:class="styles.segmentedCheck"
					aria-hidden="true"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				</span>
				{{ option === 'protect' ? copy.protect : copy.allow }}
			</button>
		</div>
		<div
			:class="[expandStyles.panel, styles.bleed]"
			:id="ids.panel"
			:data-open="open"
			:inert="!open || undefined"
		>
			<div :class="expandStyles.inner">
				<!-- A labelled group, as the dialog's confirmation is; a fieldset would bring its own border and legend. -->
				<div
					ref="confirmRef"
					:class="styles.confirm"
					role="group"
					:aria-labelledby="ids.confirmTitle"
					:aria-describedby="ids.confirmDescription"
					:data-nudged="nudges > 0"
					:data-testid="testIds.confirm"
				>
					<p
						:class="styles.confirmTitle"
						:id="ids.confirmTitle"
					>
						{{ copy.confirmTitle }}
					</p>
					<p
						:class="styles.confirmDescription"
						:id="ids.confirmDescription"
					>
						{{ copy.confirmDescription }}
					</p>
					<div :class="styles.confirmActions">
						<ChoiceButton
							ref="cancelRef"
							variant="neutral"
							mode="stroke"
							:id="ids.cancel"
							:data-testid="testIds.confirmCancel"
							@click="session.closeConfirmation()"
						>
							{{ copy.confirmCancel }}
						</ChoiceButton>
						<ChoiceButton
							variant="neutral"
							mode="stroke"
							:data-testid="testIds.confirmAllow"
							@click="confirmAllow"
						>
							{{ copy.confirmAllow }}
						</ChoiceButton>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>
