<script setup lang="ts">
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { useConsentConfig } from '../../composables/config';
import { slotAttrs } from '../../utils/slot-attrs';

/**
 * A prompt or dialog switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03); a category that cannot change shows
 * "Always on" instead of a switch. Takes `components.switch.root` (the
 * `toggle` theme slot), as the `ConsentWidget` switch does.
 */
const props = withDefaults(
	defineProps<{
		checked: boolean;
		/** The vendor table's switches are smaller. */
		size?: 'default' | 'small';
	}>(),
	{ size: 'default' }
);

const emit = defineEmits<{ change: [checked: boolean] }>();
const config = useConsentConfig();
</script>

<template>
	<!-- A switch, not a checkbox: it applies or stages at once, and screen readers announce on and off. -->
	<button
		type="button"
		role="switch"
		:aria-checked="props.checked"
		v-bind="slotAttrs(config.components?.switch?.root, styles.switch)"
		:data-size="props.size === 'small' ? 'small' : undefined"
		:data-state="props.checked ? 'checked' : 'unchecked'"
		@click="emit('change', !props.checked)"
	/>
</template>
