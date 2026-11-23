<!--
	The on-demand Vue dialog island.

	Mounted as its own Vue app the first time something opens a dialog —
	never with `client:load` — so a visitor who never opens the preference
	centre downloads no consent UI at all.

	The adapter installs `inth` with the page's runtime before mounting
	this component: Astro islands cannot see each other's provides, so the
	kernel has to be owned outside the app. The plugin borrows it and leaves
	`start()`/`dispose()` to the owner.
-->
<script setup lang="ts">
import ConsentManager from '@inth/vue/runtime/components/consent-manager.vue';
import OptOutConfirmation from '@inth/vue/runtime/components/opt-out-confirmation.vue';
import { defineAsyncComponent } from 'vue';

withDefaults(
	defineProps<{
		kind?: 'preferences' | 'iab';
		/** Which IAB preference-centre tab to open on. */
		tab?: 'purposes' | 'vendors';
	}>(),
	{ kind: 'preferences', tab: undefined }
);

// A page with `<OptOutConfirmation />` asks for the standalone
// confirmation, as React's `<OptOutConfirmation />` shows it. Mounting
// Vue's claims the confirmation, so the dialog does not adopt it and open
// on its receipt instead.
const standaloneOptOut =
	typeof document !== 'undefined' &&
	document.querySelector('[data-inth-opt-out-confirmation-host]') !== null;

// The TCF surface is the larger half of this island and only an IAB site
// ever opens it, so it arrives on its own chunk.
const IABDialogSurface = defineAsyncComponent(
	() => import('./iab-dialog-surface.vue')
);
</script>

<template>
	<IABDialogSurface
		v-if="kind === 'iab'"
		:tab="tab"
	/>
	<template v-else>
		<OptOutConfirmation v-if="standaloneOptOut" />
		<ConsentManager />
	</template>
</template>
