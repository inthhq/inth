<script setup lang="ts">
/**
 * The receipt under the rights rows: one line, a Details disclosure, and a
 * reference to copy (RCPT-*, CLIP-*, GPC-06).
 */
import { copySurfaceReference, resolveRightsReceipt } from '@inth/sdk/engine';
import { resolveRightsReceiptCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
	useConsentKernel,
	useConsentSnapshot,
} from '../../composables/use-consent-kernel';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import {
	rightsBundleOf,
	useOptOutReceiptData,
	useSurfaceSession,
} from './use-surface-session';

/** How long the copy button shows its check. */
const COPIED_MS = 1500;

/**
 * The receipt (RCPT-01): "✓ Saved for this browser · Jan 15, 2026" with
 * Details, shown only once something is recorded or a GPC signal is
 * honored, and then read as live (GPC-06). It stays mounted and toggles
 * `data-open`, so the rows below never move or lose focus (RCPT-03).
 *
 * Copying the reference announces only after the clipboard accepted it.
 * When it fails, a labelled field holds the full reference; it takes focus
 * only if Details is still open (CLIP-01, CLIP-03). The surface session
 * tokens each attempt, so a late result is ignored (CLIP-02).
 */
const props = defineProps<{
	/** Prefix for element ids in this layer (SR-05). */
	idPrefix: string;
	/** The site's name for `{business}`. */
	business?: string;
	/** The `components` part that styles the receipt. */
	part?: object;
	/**
	 * The receipt's panel shows although its banner is not expanded, as in
	 * an all-in-one side drawer, so a failed copy may still reveal the
	 * fallback field there.
	 */
	panelVisible?: boolean;
}>();

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const translations = useSurfaceTranslations();
const { session, state } = useSurfaceSession();

/** This browser's local opt-out receipt data: the reference it recorded. */
const local = useOptOutReceiptData();

const field = ref<HTMLInputElement | null>(null);
const receipt = computed(() =>
	resolveRightsReceipt(snapshot.value, local.value)
);
const copy = computed(() =>
	resolveRightsReceiptCopy(translations.value, {
		bundle: rightsBundleOf(snapshot.value, local.value),
		business: props.business,
		receipt: receipt.value,
	})
);
const detailsOpen = computed(
	() => state.value.receiptOpen && receipt.value.show
);
const status = computed(() => state.value.copy.status);
const ids = computed(() => ({
	details: `${props.idPrefix}-receipt-details`,
	field: `${props.idPrefix}-reference-field`,
	fieldLabel: `${props.idPrefix}-reference-field-label`,
}));

// The check on the copy button goes after a moment.
watch(status, (value, _previous, onCleanup) => {
	if (value !== 'copied') {
		return;
	}
	const timer = setTimeout(() => session.resetCopy(), COPIED_MS);
	onCleanup(() => clearTimeout(timer));
});

let fieldFrame = 0;
onBeforeUnmount(() => cancelAnimationFrame(fieldFrame));
const copyReference = async () => {
	const { reference } = receipt.value;
	if (!reference) {
		return;
	}
	const finish = await copySurfaceReference(kernel, reference, undefined, {
		panelVisible: props.panelVisible,
	});
	if (!(finish.applied && finish.reveal)) {
		return;
	}
	const failed = session.getState().copy.status === 'failed';
	session.announce(failed ? copy.value.copyFailed : copy.value.copied);
	if (failed) {
		// The field renders with the failure; focus it once it has.
		cancelAnimationFrame(fieldFrame);
		fieldFrame = requestAnimationFrame(() => {
			field.value?.focus({ preventScroll: true });
			field.value?.select();
		});
	}
};
</script>

<template>
	<div
		v-bind="slotAttrs(part, [styles.disclosure, styles.bleed])"
		:data-open="receipt.show"
		:inert="!receipt.show || undefined"
		:data-receipt-kind="receipt.show ? receipt.kind : undefined"
		data-testid="consent-dialog-receipt"
		tabindex="-1"
	>
		<div :class="styles.disclosureInner">
			<div :class="styles.receipt">
				<div :class="styles.receiptLine">
					<span :class="styles.receiptLead">
						<svg
							width="14"
							height="14"
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
						<span>{{ copy.lead }}</span>
					</span>
					<button
						type="button"
						:class="styles.textButton"
						:aria-expanded="detailsOpen"
						:aria-controls="ids.details"
						data-testid="consent-dialog-receipt-toggle"
						@click="session.toggleReceipt()"
					>
						{{ copy.details }}
						<span :class="styles.chevron">
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</span>
					</button>
				</div>
				<div
					:class="styles.disclosure"
					:id="ids.details"
					:data-open="detailsOpen"
					:inert="!detailsOpen || undefined"
					data-testid="consent-dialog-receipt-details"
				>
					<div :class="styles.disclosureInner">
						<div :class="styles.receiptDetails">
							<ul>
								<li
									v-for="item in copy.items"
									:key="item.text"
								>
									{{ item.text
									}}<span
										v-if="item.source"
										:class="styles.receiptMuted"
										>{{ ` · ${item.source}` }}</span
									>
								</li>
							</ul>
							<div :class="styles.receiptMuted">{{ copy.scope }}</div>
							<div :class="styles.receiptMuted">
								{{ copy.recorded
								}}<template
									v-if="receipt.kind === 'stored' && receipt.reference"
									>{{ ` · ${copy.referenceLabel} `
									}}<span
										:class="styles.reference"
										:title="receipt.reference"
										>{{ receipt.reference.slice(0, 8)
										}}<button
											type="button"
											:class="styles.copyButton"
											:aria-label="copy.copy"
											:data-copied="status === 'copied' ? 'true' : undefined"
											data-testid="consent-dialog-copy-reference"
											@click="copyReference"
										>
											<svg
												v-if="status === 'copied'"
												width="14"
												height="14"
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
											<svg
												v-else
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
												<rect
													x="9"
													y="9"
													width="13"
													height="13"
													rx="2"
												/>
												<path
													d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
												/>
											</svg></button></span
								></template>
							</div>
							<div v-if="status === 'failed' && receipt.reference">
								<label
									:for="ids.field"
									:id="ids.fieldLabel"
									>{{ copy.copyFailedLabel }}</label
								>
								<input
									ref="field"
									:id="ids.field"
									:class="styles.referenceField"
									type="text"
									readonly
									:value="receipt.reference"
									data-testid="consent-dialog-reference-field"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
