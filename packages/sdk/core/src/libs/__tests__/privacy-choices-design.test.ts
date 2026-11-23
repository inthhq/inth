import { normalizePolicyRule, policyRulePresets } from '@inth/sdk-schema/types';
import type { PolicyRule } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import {
	matchedResolution,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import {
	resolvePrivacyChoicesBannerCopy,
	resolvePrivacyChoicesRegime,
	resolvePrivacyChoicesVariant,
	resolveSaleRightCopy,
} from '../consent-copy';
import {
	resolveConsentDesign,
	resolveConsentPresentation,
} from '../policy-actions';
import type { ConsentPresentation } from '../policy-actions';
import { resolvePrivacyChoicesLink } from '../privacy-choices-link';

const choice = normalizePolicyRule({
	id: 'choice',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
});

const resolve = (
	presentation?: ConsentPresentation,
	override?: Parameters<typeof resolveConsentPresentation>[0]['override'],
	surface: 'prompt' | 'preferences' = 'prompt'
) =>
	resolveConsentPresentation({
		override,
		policy: choice,
		presentation,
		surface,
	}).design;

describe('design', () => {
	it('stays classic by default, so existing sites keep today’s UI', () => {
		expect(resolve()).toBe('classic');
		expect(resolve({ prompt: { variant: 'bar' } })).toBe('classic');
		expect(resolve({ prompt: { blockUntilChoice: true } })).toBe('classic');
	});

	it('is privacy-choices when the host asks for it', () => {
		expect(resolve({ design: 'privacy-choices' })).toBe('privacy-choices');
		expect(
			resolve({ design: 'privacy-choices' }, undefined, 'preferences')
		).toBe('privacy-choices');
	});

	it('opts in when the host sets a prompt container, which only v6 reads', () => {
		expect(resolve({ prompt: { container: { type: 'drawer' } } })).toBe(
			'privacy-choices'
		);
		expect(resolve(undefined, { container: { type: 'card' } })).toBe(
			'privacy-choices'
		);
		expect(
			resolve(
				{ prompt: { container: { type: 'banner' } } },
				undefined,
				'preferences'
			)
		).toBe('privacy-choices');
	});

	it('lets an explicit classic win over a container', () => {
		expect(
			resolve({
				design: 'classic',
				prompt: { container: { type: 'drawer' } },
			})
		).toBe('classic');
	});

	it('ignores a malformed design value', () => {
		expect(
			resolve({ design: 'v6' as unknown as ConsentPresentation['design'] })
		).toBe('classic');
	});
});

const presetPolicy = (rule: PolicyRule | PolicyRule[]) =>
	normalizePolicyRule(Array.isArray(rule) ? (rule[0] as PolicyRule) : rule);

describe('resolvePrivacyChoicesVariant', () => {
	it('[BNR-01] follows the region presets', () => {
		const presets = policyRulePresets as unknown as Record<
			string,
			() => PolicyRule | PolicyRule[]
		>;
		const variant = (name: string) => {
			const preset = presets[name];
			if (!preset) {
				throw new Error(`No preset ${name}`);
			}
			return resolvePrivacyChoicesVariant(presetPolicy(preset()));
		};
		expect(variant('europeOptIn')).toBe('choice');
		expect(variant('usPrivacyStatesOptIn')).toBe('us-consent');
		expect(variant('californiaOptIn')).toBe('us-consent');
		expect(variant('usPrivacyStatesOptOut')).toBe('none');
		expect(variant('californiaOptOut')).toBe('none');
		expect(variant('europeIab')).toBe('none');
	});

	it('[BNR-10] shows the notice for an opt-out notice prompt', () => {
		expect(
			resolvePrivacyChoicesVariant(
				normalizePolicyRule({
					id: 'notice',
					match: { fallback: true },
					model: 'opt-out',
					prompt: 'notice',
					scopeMode: 'permissive',
				})
			)
		).toBe('notice');
	});

	it('keeps an opt-out choice prompt in cookie terms', () => {
		expect(
			resolvePrivacyChoicesVariant({
				model: 'opt-out',
				prompt: 'choice',
				rights: ['disclosure', 'opt-out', 'preferences'],
			})
		).toBe('choice');
	});
});

describe('resolvePrivacyChoicesBannerCopy', () => {
	it('[BNR-09] asks in US terms and never reuses the GDPR wording', () => {
		const copy = resolvePrivacyChoicesBannerCopy(undefined, {
			bundle: 'sale-ads',
			business: 'Acme',
			variant: 'us-consent',
		});
		expect(copy.title).toBe('Your privacy choices');
		expect(copy.reject).toBe("Don't allow");
		expect(copy.accept).toBe('Allow');
		expect(copy.expandBar).toBe('Choose');
		expect(copy.barDescription).toBe(
			'Acme asks before using optional cookies or selling your data or using it for ads.'
		);
		expect(Object.values(copy).join(' ')).not.toMatch(/Reject All|Accept All/u);
	});

	it('[GPC-08] says an honored signal on the notice', () => {
		const copy = resolvePrivacyChoicesBannerCopy(undefined, {
			bundle: 'all',
			gpc: true,
			variant: 'notice',
		});
		expect(copy.barDescription).toMatch(
			/Global Privacy Control signal is honored/u
		);
		expect(copy.description).toMatch(/being honored/u);
		expect(copy.expand).toBe('Do not sell or share my data');
	});

	it('[EU-01] gives the EU prompt its own reject and accept pair', () => {
		const copy = resolvePrivacyChoicesBannerCopy(undefined, {
			bundle: 'all',
			variant: 'choice',
		});
		expect([copy.reject, copy.accept, copy.expand]).toEqual([
			'Reject All',
			'Accept All',
			'Customize',
		]);
		expect([copy.rejectExpanded, copy.acceptExpanded, copy.save]).toEqual([
			'Reject all',
			'Accept all',
			'Save choices',
		]);
	});
});

describe('resolveSaleRightCopy', () => {
	const base = {
		bundle: 'all' as const,
		business: 'Acme',
		locked: false,
		model: 'opt-out',
		selected: 'allow' as const,
		source: 'default' as const,
	};

	it('[RIGHT-01] puts the protective option first in each regime', () => {
		expect(resolveSaleRightCopy(undefined, base).protect).toBe('Opt out');
		expect(
			resolveSaleRightCopy(undefined, { ...base, model: 'opt-in' }).protect
		).toBe("Don't allow");
	});

	it('[SR-04] labels the group with the statutory phrase from the bundle', () => {
		expect(resolveSaleRightCopy(undefined, base).groupLabel).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(
			resolveSaleRightCopy(undefined, { ...base, bundle: 'sale-ads' })
				.groupLabel
		).toBe('Opt out of the sale of my personal data and targeted advertising');
		expect(
			resolveSaleRightCopy(undefined, {
				...base,
				bundle: 'sale-ads',
				model: 'opt-in',
			}).groupLabel
		).toBe('Allow selling and targeted ads');
	});

	it('[COPY-02] says "Off by default" only for an untouched default', () => {
		const refused = { ...base, model: 'opt-in', selected: 'protect' as const };
		expect(resolveSaleRightCopy(undefined, refused).description).toMatch(
			/^Off by default\. Acme won't sell/u
		);
		expect(
			resolveSaleRightCopy(undefined, { ...refused, source: 'user' })
				.description
		).toBe(
			"Acme won't sell or share your personal information or use it for targeted ads on this browser."
		);
	});

	it('capitalises the business fallback wherever it opens a sentence', () => {
		const refused = {
			...base,
			business: undefined,
			model: 'opt-in',
			selected: 'protect' as const,
		};
		expect(resolveSaleRightCopy(undefined, refused).description).toBe(
			"Off by default. This site won't sell or share your personal information or use it for targeted ads unless you allow it."
		);
		// Mid-sentence it stays lower case, and a real name is never recased.
		expect(
			resolveSaleRightCopy(undefined, { ...refused, selected: 'allow' })
				.description
		).toBe(
			'This site may sell or share your personal information, including for targeted ads.'
		);
		expect(
			resolveSaleRightCopy(undefined, { ...refused, locked: true }).description
		).toMatch(/signal, so this site won't/u);
		expect(
			resolveSaleRightCopy(undefined, { ...refused, business: 'acme' })
				.description
		).toMatch(/^Off by default\. acme won't/u);
	});

	it('[GPC-04] replaces the description with the GPC note while locked', () => {
		const copy = resolveSaleRightCopy(undefined, {
			...base,
			locked: true,
			selected: 'protect',
			source: 'gpc',
		});
		expect(copy.description).toMatch(
			/^Your browser sent a Global Privacy Control/u
		);
		expect(copy.description).not.toMatch(/turn off/iu);
	});

	it('[COPY-01] builds the confirmation from the bundle', () => {
		const copy = resolveSaleRightCopy(undefined, {
			...base,
			bundle: 'sale-share',
			selected: 'protect',
			source: 'user',
		});
		expect(copy.confirmTitle).toBe('Allow selling and sharing again?');
		expect(copy.confirmDescription).toBe(
			'Acme may sell or share your personal information. You can opt out again at any time.'
		);
		expect(copy.confirmCancel).toBe('Keep opted out');
	});
});

describe('resolvePrivacyChoicesRegime', () => {
	const presets = policyRulePresets as unknown as Record<
		string,
		() => PolicyRule | PolicyRule[]
	>;
	const regime = (name: string) => {
		const preset = presets[name];
		if (!preset) {
			throw new Error(`No preset ${name}`);
		}
		return resolvePrivacyChoicesRegime(presetPolicy(preset()));
	};

	it('follows the region presets', () => {
		expect(regime('europeOptIn')).toBe('eu');
		expect(regime('usPrivacyStatesOptIn')).toBe('us');
		expect(regime('californiaOptIn')).toBe('us');
		expect(regime('usPrivacyStatesOptOut')).toBe('us');
		expect(regime('californiaOptOut')).toBe('us');
	});

	it('reads the model and US markers, never the prompt', () => {
		// An EU opt-in policy that shows no banner still opens the EU dialog.
		expect(
			resolvePrivacyChoicesRegime({
				model: 'opt-in',
				prompt: 'none',
				rights: ['disclosure', 'preferences'],
			} as Parameters<typeof resolvePrivacyChoicesRegime>[0])
		).toBe('eu');
		expect(
			resolvePrivacyChoicesRegime({
				model: 'opt-in',
				privacySignals: { gpc: { denyCategories: ['marketing'] } },
				rights: ['disclosure', 'preferences'],
			})
		).toBe('us');
		expect(
			resolvePrivacyChoicesRegime({
				model: 'opt-in',
				rights: ['disclosure', 'opt-out', 'preferences'],
			})
		).toBe('us');
		expect(
			resolvePrivacyChoicesRegime({
				model: 'opt-out',
				rights: ['disclosure', 'preferences'],
			})
		).toBe('us');
	});
});

describe('resolveConsentDesign', () => {
	it('lets an explicit design win, else a prompt container opts in', () => {
		expect(resolveConsentDesign(undefined)).toBe('classic');
		expect(resolveConsentDesign({ design: 'privacy-choices' })).toBe(
			'privacy-choices'
		);
		expect(
			resolveConsentDesign({ prompt: { container: { type: 'card' } } })
		).toBe('privacy-choices');
		expect(
			resolveConsentDesign({
				design: 'classic',
				prompt: { container: { type: 'card' } },
			})
		).toBe('classic');
	});
});

describe('resolvePrivacyChoicesLink', () => {
	const snapshotFor = (rule: PolicyRule) =>
		createConsentKernel({
			consentCategories: ['necessary', 'marketing', 'measurement'],
			initialPolicyResolution: matchedResolution(rule),
		}).getSnapshot();
	const GPC_MAP = { gpc: { denyCategories: ['marketing' as const] } };

	it('is the configured opt-out link under an opt-out right, in either design', () => {
		const snapshot = snapshotFor(
			optOutRule({ rights: ['disclosure', 'opt-out', 'preferences'] })
		);
		expect(resolvePrivacyChoicesLink(snapshot, undefined)).toEqual({
			icon: null,
			label: 'Do Not Sell or Share My Personal Information',
			variant: 'do-not-sell',
		});
		expect(
			resolvePrivacyChoicesLink(snapshot, undefined, {
				design: 'privacy-choices',
				variant: 'privacy-choices',
			})
		).toEqual({
			icon: 'cppa-opt-out',
			label: 'Your Privacy Choices',
			variant: 'privacy-choices',
		});
	});

	it('[BNR-05] stays a way back in under US opt-in with the Privacy Choices design, with no opt-out icon', () => {
		const snapshot = snapshotFor(optInRule({ privacySignals: GPC_MAP }));
		expect(resolvePrivacyChoicesLink(snapshot, undefined)).toBeNull();
		expect(
			resolvePrivacyChoicesLink(snapshot, undefined, {
				design: 'privacy-choices',
				variant: 'california-privacy-choices',
			})
		).toEqual({
			icon: null,
			label: 'Your Privacy Choices',
			variant: 'choices',
		});
	});

	it('shows nothing while an external source owns consent or for IAB', () => {
		const iab = snapshotFor({ ...optInRule(), model: 'iab' } as PolicyRule);
		expect(
			resolvePrivacyChoicesLink(iab, undefined, { design: 'privacy-choices' })
		).toBeNull();
		const external = {
			...snapshotFor(optInRule()),
			externalPermissions: true,
		} as unknown as Parameters<typeof resolvePrivacyChoicesLink>[0];
		expect(
			resolvePrivacyChoicesLink(external, undefined, {
				design: 'privacy-choices',
			})
		).toBeNull();
	});
});
