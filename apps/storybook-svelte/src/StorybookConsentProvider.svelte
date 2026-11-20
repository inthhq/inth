<script lang="ts">
	import { InthProvider } from '@inth/svelte';
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/types';
	import {
		defaultConsentOptions,
		resetStorybookConsentState,
		seedStoredConsent,
		seedTCString,
	} from './storybook-consent-fixtures';
	import type { ConsentRecord } from './storybook-consent-fixtures';

	const props = $props<{
		children: Snippet;
		options?: Partial<ConsentManagerOptions>;
		storedConsent?: ConsentRecord;
		tcString?: string | null;
	}>();

	const initialStoredConsent = untrack(() => props.storedConsent);
	const initialTcString = untrack(() => props.tcString ?? null);
	const mergedOptions = {
		...defaultConsentOptions,
		...(untrack(() => props.options) ?? {}),
	};

	if (typeof window !== 'undefined') {
		resetStorybookConsentState();
		if (initialStoredConsent) {
			seedStoredConsent(initialStoredConsent);
		}
		seedTCString(initialTcString);
	}
</script>

<InthProvider options={mergedOptions}>
	{@render props.children()}
</InthProvider>
