import type { ExperimentArmName } from '@inth/nextjs';
import { defineExperiment } from '@inth/nextjs/engine';

/**
 * Does a full-width Banner at the bottom of the page get as many opt-ins as
 * the Card, while covering less of the shop?
 *
 * `control` is the stock banner in Northwind's theme: a Card in the start
 * corner. The `bar` arm changes only the container. The policy,
 * the copy and the buttons stay the same, so both arms record choices under
 * the same policy.
 */
export const bannerExperiment = defineExperiment({
	arms: {
		bar: { prompt: { container: { edge: 'bottom', type: 'banner' } } },
	},
	id: 'banner-layout',
	// Used only when the flag lookup returns nothing and Inth picks the arm.
	split: { bar: 50, control: 50 },
});

export type BannerArm = ExperimentArmName<typeof bannerExperiment>;

/**
 * Stands in for your feature-flag client. Here the flag comes from
 * `NEXT_PUBLIC_BANNER_LAYOUT`, which Next.js inlines at build time. Swap the
 * body for your provider's lookup:
 *
 *   growthbook.getFeatureValue('banner-layout', undefined)
 *   ldClient.stringVariation('banner-layout', undefined)
 *
 * PostHog resolves flags asynchronously, so wait for them before mounting
 * the provider: https://c15t.com/docs/guides/banner-experiments#posthog
 */
const readFlag = (): string | undefined =>
	process.env.NEXT_PUBLIC_BANNER_LAYOUT;

/**
 * The arm the flag assigned, or `undefined` to let Inth pick one by
 * `split`. Inth records who assigned the arm (`host` or `inth`) with every
 * impression and choice.
 */
export const bannerArmFromFlag = (): BannerArm | undefined => {
	const value = readFlag();
	return value === 'control' || value === 'bar' ? value : undefined;
};
