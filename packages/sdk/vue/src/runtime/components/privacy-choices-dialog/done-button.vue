<script setup lang="ts">
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-dialog.css';

import { useConsentConfig } from '../../composables/config';
import ChoiceButton from '../privacy-choices/choice-button.vue';

/**
 * Done, which closes and commits nothing (LAW-04). Its label never changes
 * (SR-07): on desktop the cue sits beside it, absolutely placed so Done
 * never moves (MOT-04); on phone a check slides in before the label. The
 * cue's slot is always there, so Done keeps its node and focus (FOC-06).
 */
defineProps<{
	/** Bumped on every change, so the cue replays; `0` hides it. */
	cue: number;
	label: string;
	cueLabel: string;
	testId: 'consent-dialog-done' | 'consent-dialog-sheet-done';
}>();

const emit = defineEmits<{ click: [] }>();
const config = useConsentConfig();
</script>

<template>
	<span
		:class="styles.cueSlot"
		aria-hidden="true"
	>
		<span
			v-if="cue > 0"
			:key="cue"
			:class="styles.savedCue"
			data-testid="consent-dialog-saved-cue"
		>
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
				<path d="M20 6 9 17l-5-5" /></svg
			>{{ cueLabel }}
		</span>
	</span>
	<ChoiceButton
		is-primary
		:part="config.components?.dialog?.doneButton"
		:base-class="styles.done"
		:data-cue="cue > 0 ? 'true' : undefined"
		:data-testid="testId"
		@click="emit('click')"
	>
		<span
			:class="styles.doneCheck"
			aria-hidden="true"
		>
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
				<path d="M20 6 9 17l-5-5" /></svg></span
		>{{ label }}
	</ChoiceButton>
</template>
