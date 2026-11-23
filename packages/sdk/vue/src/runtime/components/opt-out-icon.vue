<script setup lang="ts">
import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';

/**
 * The icon's own size, 14px tall at the glyph's proportions. A page where
 * the `optOutIcon` rule is not applied, such as one without the stock
 * stylesheets, would otherwise let it fill the line; the rule, when
 * present, wins.
 */
const ICON_HEIGHT = 14;
const [, , boxWidth = ICON_HEIGHT, boxHeight = ICON_HEIGHT] =
	CPPA_OPT_OUT_ICON.viewBox.split(' ').map(Number);
const ICON_WIDTH = Math.round((ICON_HEIGHT * boxWidth) / boxHeight);
</script>

<template>
	<svg
		aria-hidden="true"
		focusable="false"
		:width="ICON_WIDTH"
		:height="ICON_HEIGHT"
		:viewBox="CPPA_OPT_OUT_ICON.viewBox"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			v-for="path in CPPA_OPT_OUT_ICON.paths"
			:key="path.d"
			:clip-rule="path.evenOdd ? 'evenodd' : undefined"
			:d="path.d"
			:fill="path.fill"
			:fill-rule="path.evenOdd ? 'evenodd' : undefined"
		/>
	</svg>
</template>
