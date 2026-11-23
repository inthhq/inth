<script setup lang="ts">
import styles from '@inth/sdk/ui/styles/components/privacy-choices';

import '@inth/sdk/ui/styles/components/privacy-choices.css';

/**
 * A Privacy Choices switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03); a category that cannot change shows
 * "Always on" instead of a switch.
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
</script>

<template>
	<!-- A switch, not a checkbox: it applies or stages at once, and screen readers announce on and off. -->
	<button
		type="button"
		role="switch"
		:aria-checked="props.checked"
		:class="styles.switch"
		:data-size="props.size === 'small' ? 'small' : undefined"
		:data-state="props.checked ? 'checked' : 'unchecked'"
		@click="emit('change', !props.checked)"
	/>
</template>
