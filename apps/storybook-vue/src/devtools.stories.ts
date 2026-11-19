import {
	devToolsPrefetch,
	devToolsPresentation,
	devToolsScripts,
	getDevToolsCategories,
} from '@inth/conformance/fixtures/devtools';
import { devToolsFlow, devToolsReady } from '@inth/conformance/play/devtools';
import type { HydrationRecords, HydrationResult } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import { writePolicyResolutionWire } from '@inth/sdk/schema/types';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onUnmounted } from 'vue';

import { DevTools } from '../../../packages/sdk/vue/src/devtools';
import { createVueConsentKernelContext } from '../../../packages/sdk/vue/src/runtime/kernel';
import {
	provideStorybookConsentContext,
	storybookConsentConfig,
	storybookInit,
	storybookMode,
} from './storybook-consent-fixtures';

/**
 * `hydrate` applies stored records the way persistence does. It is a verb
 * only core's own modules call, so it is not on `ConsentKernel`.
 */
const hydrateRecords = <KernelType extends object>(
	kernel: KernelType,
	records: HydrationRecords
): HydrationResult =>
	(
		kernel as KernelType & {
			hydrate: (input: HydrationRecords) => HydrationResult;
		}
	).hydrate(records);

const meta = {
	component: DevTools,
	parameters: { layout: 'fullscreen' },
	tags: ['devtools'],
	title: 'COMPONENTS - VUE/Core/DevTools',
} satisfies Meta<typeof DevTools>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: devToolsReady,
	render: () => ({
		components: { DevTools },
		setup() {
			const init = {
				branding: storybookInit.branding,
				location: devToolsPrefetch.initialLocation,
				policyResolution: writePolicyResolutionWire(
					devToolsPrefetch.initialPolicyResolution
				),
				translations: storybookInit.translations,
			};
			const config = {
				...storybookConsentConfig,
				consentCategories: [...getDevToolsCategories()],
				presentation: devToolsPresentation,
				// The shared play verifies script cleanup after rejecting consent.
				reloadOnConsentRevoked: false,
			};
			const context = createVueConsentKernelContext({
				config,
				mode: storybookMode(((input: RequestInfo | URL, request?: RequestInit) =>
					Promise.resolve(
						new Response(
							JSON.stringify(
								String(input).includes('/v1/consent/records')
									? {
											recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
											subjectId: (
												JSON.parse(String(request?.body)) as {
													subjectId: string;
												}
											).subjectId,
										}
									: init
							),
							{
								headers: { 'content-type': 'application/json' },
							}
						)
					)) as typeof fetch),
				prefetch: init,
				producerContract: 1,
			});
			hydrateRecords(context.kernel, {
				now: devToolsPrefetch.now,
				subject: devToolsPrefetch.initialRecords.subject,
			});
			provideStorybookConsentContext(null, context, config);
			const loader = createScriptLoader({
				kernel: context.kernel,
				scripts: devToolsScripts,
			});
			void context.kernel.commands.init();
			onUnmounted(() => {
				loader.dispose();
				context.dispose();
			});
			return { getDevToolsCategories };
		},
		template:
			'<DevTools default-open :get-consent-categories="getDevToolsCategories" />',
	}),
};
export const ConsentAndScriptsFlow: Story = { ...Default, play: devToolsFlow };
