import type { ConsentKernel, ConsentSnapshot } from '@c15t/core';
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';

import type { ConsentManagerOptions } from '../lib/types';
import ConformanceFixture from './fixtures/conformance-fixture.svelte';
import ConsentRootFixture from './fixtures/consent-root-fixture.svelte';
import PolicyFixture from './fixtures/policy-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';

export const renderFixture = function renderFixture(
	props:
		| ComponentProps<typeof PolicyFixture>
		| ComponentProps<typeof ConformanceFixture>,
	fixture: string
) {
	let snapshot: ConsentSnapshot | undefined;
	const onKernel = (kernel: ConsentKernel) => {
		snapshot = kernel.getServerSnapshot();
	};
	const options: ConsentManagerOptions = {
		...props.options,
		mode: transportMode({}),
	};
	const output =
		fixture === 'policy-fixture.svelte'
			? render(PolicyFixture, { props: { ...props, onKernel, options } })
			: render(ConformanceFixture, {
					props: { component: 'consent-banner', ...props, onKernel, options },
				});
	const html = output.body;
	if (!snapshot) {
		throw new Error('Server render did not expose a snapshot');
	}
	return {
		html,
		now: snapshot.evaluatedAt,
		prompt: snapshot.promptRequirement,
	};
};

/** Server render of `ConsentRoot`: the HTML a browser hydrates. */
export const renderRoot = function renderRoot(
	props: ComponentProps<typeof ConsentRootFixture>
) {
	const output = render(ConsentRootFixture, { props });
	return { body: output.body, head: output.head };
};
