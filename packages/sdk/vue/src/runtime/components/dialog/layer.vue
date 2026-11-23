<script setup lang="ts">
import { attachLiveRegion } from '@inth/sdk/ui/primitives/surface';
import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-expand.css';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { StyleValue } from 'vue';

import { useConsentConfig } from '../../composables/config';
import { slotAttrs } from '../../utils/slot-attrs';

/**
 * One card: the main dialog or a phone sheet. Only the top layer is modal;
 * a covered parent is inert, dims and steps back (NEST-03).
 */
const props = withDefaults(
	defineProps<{
		idPrefix: string;
		title: string;
		intro?: string | null;
		closeLabel: string;
		/** This layer's own status text (SR-01). */
		status: string;
		nested: boolean;
		top: boolean;
		closing?: boolean;
		depth: number;
		eu: boolean;
		sheetId?: string;
		/** The `components` part for the card: `dialog.card` or `dialog.sheet`. */
		part?: object;
	}>(),
	{ closing: false, intro: null, part: undefined, sheetId: undefined }
);

const emit = defineEmits<{ close: [] }>();

const config = useConsentConfig();
const element = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const statusRef = ref<HTMLElement | null>(null);
defineExpose({ body, element, title: heading });

const titleId = computed(() => `${props.idPrefix}-title`);
const cardAttrs = computed(() => {
	const attributes = slotAttrs(props.part, styles.card);
	const style: StyleValue = [
		attributes.style as StyleValue,
		{ '--consent-dialog-depth': props.depth },
	];
	return { ...attributes, style };
});

// A layer's own `role="status"` region (SR-01). It shows only messages the
// layer made, and none while it closes (SR-02).
let region: LiveRegion | null = null;
onMounted(() => {
	if (statusRef.value) {
		region = attachLiveRegion(statusRef.value);
	}
});
onBeforeUnmount(() => {
	region?.();
	region = null;
});
watch(
	() => (props.top && !props.closing ? props.status : ''),
	(text) => region?.render(text),
	{ flush: 'post' }
);
onMounted(() => {
	region?.render(props.top && !props.closing ? props.status : '');
});
</script>

<template>
	<!-- Layers stack inside one backdrop and the top-layer trap; a native <dialog> brings its own top layer and Escape handling. -->
	<section
		ref="element"
		v-bind="cardAttrs"
		role="dialog"
		:aria-modal="top && !closing ? true : undefined"
		:aria-labelledby="titleId"
		:data-regime="eu ? 'eu' : 'us'"
		:data-nested="nested ? 'true' : undefined"
		:data-nested-open="depth > 0 ? '' : undefined"
		:data-state="closing ? 'closed' : 'open'"
		:data-sheet="sheetId"
		:inert="!top || closing || undefined"
		:data-testid="nested ? 'consent-dialog-sheet' : 'consent-dialog-card'"
	>
		<header
			v-bind="slotAttrs(config.components?.dialog?.header, styles.header)"
			:data-testid="nested ? undefined : 'consent-dialog-header'"
		>
			<div>
				<h2
					ref="heading"
					v-bind="slotAttrs(config.components?.dialog?.title, styles.title)"
					:id="titleId"
					tabindex="-1"
					:data-testid="nested ? undefined : 'consent-dialog-title'"
				>
					{{ props.title }}
				</h2>
				<p
					v-if="intro"
					v-bind="
						slotAttrs(config.components?.description?.dialog, styles.intro)
					"
					:data-testid="nested ? undefined : 'consent-dialog-intro'"
				>
					{{ intro }}
				</p>
			</div>
			<button
				type="button"
				:class="styles.close"
				:aria-label="closeLabel"
				:data-testid="
					nested ? 'consent-dialog-sheet-close' : 'consent-dialog-close'
				"
				@click="emit('close')"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</header>
		<div
			ref="body"
			v-bind="
				slotAttrs(config.components?.dialog?.content, [
					expandStyles.scroll,
					styles.body,
				])
			"
			:data-testid="nested ? undefined : 'consent-dialog-content'"
		>
			<slot />
		</div>
		<footer
			v-bind="slotAttrs(config.components?.dialog?.footer, styles.footer)"
			:data-testid="nested ? undefined : 'consent-dialog-footer'"
		>
			<slot name="footer" />
		</footer>
		<div
			ref="statusRef"
			:class="styles.visuallyHidden"
			:data-testid="nested ? undefined : 'consent-dialog-status'"
		/>
	</section>
</template>
