<script setup lang="ts">
import { resolveOptOutCopy } from '@inth/sdk/surface-state';

import '@inth/sdk/ui/styles/components/opt-out-confirmation.css';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { computed } from 'vue';

import { useConsentInit } from '../composables';
import { useOptOutReceipt } from '../composables/kernel';
import { useSurfaceTranslations } from '../composables/use-surface-translations';

withDefaults(
	defineProps<{
		noStyle?: boolean;
		recordedAtTestId?: string;
		referenceTestId?: string;
		testId?: string;
	}>(),
	{
		noStyle: false,
		recordedAtTestId: 'opt-out-confirmation-recorded-at',
		referenceTestId: 'opt-out-confirmation-reference',
		testId: 'opt-out-confirmation-receipt',
	}
);

const formatRecordedAt = function formatRecordedAt(
	at: number,
	language: string | undefined
): string {
	try {
		return new Intl.DateTimeFormat(language, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	} catch {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	}
};

const init = useConsentInit();
const translations = useSurfaceTranslations();
const receipt = useOptOutReceipt();
const optOutCopy = computed(() => resolveOptOutCopy(translations.value));
const language = computed(() => init.value?.translations?.language);
const recordedIso = computed(() =>
	receipt.value.at === null
		? undefined
		: new Date(receipt.value.at).toISOString()
);
const recordedFormatted = computed(() =>
	receipt.value.at === null
		? ''
		: formatRecordedAt(receipt.value.at, language.value)
);
</script>

<template>
	<dl
		v-if="receipt.at !== null || receipt.reference !== null"
		:class="noStyle ? undefined : styles.receipt"
		:data-testid="testId"
	>
		<div
			v-if="receipt.at !== null"
			:class="noStyle ? undefined : styles.receiptRow"
		>
			<dt :class="noStyle ? undefined : styles.receiptLabel">
				{{ optOutCopy.recordedLabel }}
			</dt>
			<dd :class="noStyle ? undefined : styles.receiptValue">
				<time
					:datetime="recordedIso"
					:data-testid="recordedAtTestId"
				>
					{{ recordedFormatted }}
				</time>
			</dd>
		</div>
		<div
			v-if="receipt.reference !== null"
			:class="noStyle ? undefined : styles.receiptRow"
		>
			<dt :class="noStyle ? undefined : styles.receiptLabel">
				{{ optOutCopy.referenceLabel }}
			</dt>
			<dd :class="noStyle ? undefined : styles.receiptValue">
				<code
					:class="noStyle ? undefined : styles.reference"
					:data-testid="referenceTestId"
				>
					{{ receipt.reference }}
				</code>
			</dd>
		</div>
	</dl>
</template>
