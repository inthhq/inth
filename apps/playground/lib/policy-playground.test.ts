import { policyRulePresets } from '@inth/sdk/schema/types';
import { describe, expect, it } from 'vite-plus/test';

import {
	autoContainerFor,
	buildBackendSnippet,
	buildProviderSnippet,
	DEFAULT_PRESENTATION_FORM,
	DEMO_NOTICE_PRESENTATION,
	DEMO_PRESENTATION_BY_RULE,
	defaultContainerFor,
	describeMatch,
	fromPolicyRule,
	getPlaygroundPreset,
	inspectPlaygroundRule,
	playgroundPresets,
	positionOptionsFor,
	presentationForRule,
	resolvePlaygroundPresentation,
	setPresentationContainer,
	toConsentPresentation,
	toPolicyRule,
	isRecommendedPreset,
	promptsForModel,
	RECOMMENDED_PRESET_IDS,
} from './policy-playground';

describe('policy playground helpers', () => {
	it('lists every shipped preset with a location that matches it', () => {
		expect(playgroundPresets.map((preset) => preset.id).sort()).toEqual(
			Object.keys(policyRulePresets).sort()
		);
		for (const preset of playgroundPresets) {
			const { resolution, errors } = inspectPlaygroundRule(preset.rule, {
				country: preset.country,
				region: preset.region ?? '',
			});
			expect(errors, preset.id).toEqual([]);
			expect(resolution.status, preset.id).toBe('matched');
		}
	});

	it('round-trips a preset through the form without changing behavior', () => {
		for (const preset of playgroundPresets) {
			const rebuilt = toPolicyRule(fromPolicyRule(preset.rule), preset.rule);
			const original = inspectPlaygroundRule(preset.rule, {
				country: preset.country,
				region: preset.region ?? '',
			});
			const roundTrip = inspectPlaygroundRule(rebuilt, {
				country: preset.country,
				region: preset.region ?? '',
			});
			expect(roundTrip.errors, preset.id).toEqual([]);
			expect(roundTrip.fingerprints?.policy, preset.id).toBe(
				original.fingerprints?.policy
			);
			expect(roundTrip.fingerprints?.choice, preset.id).toBe(
				original.fingerprints?.choice
			);
		}
	});

	it('reports an invalid prompt for the model instead of throwing', () => {
		const form = fromPolicyRule(policyRulePresets.europeOptIn());
		const rule = toPolicyRule({ ...form, prompt: 'none' });
		const inspection = inspectPlaygroundRule(rule, {
			country: 'GB',
			region: '',
		});
		expect(inspection.errors.length).toBeGreaterThan(0);
		expect(inspection.resolved).toBeNull();
		expect(inspection.resolution.status).toBe('failed');
	});

	it('changes the choice fingerprint when validity or copy revision change', () => {
		const base = getPlaygroundPreset('europeOptIn');
		const form = fromPolicyRule(base.rule);
		const before = inspectPlaygroundRule(toPolicyRule(form, base.rule), {
			country: 'GB',
			region: '',
		});
		const bumped = inspectPlaygroundRule(
			toPolicyRule({ ...form, copyRevision: 'v2' }, base.rule),
			{
				country: 'GB',
				region: '',
			}
		);
		expect(bumped.fingerprints?.choice).not.toBe(before.fingerprints?.choice);
	});

	it('resolves regions before countries and falls back for unknown locations', () => {
		const california = toPolicyRule(
			fromPolicyRule(policyRulePresets.californiaOptOut())
		);
		expect(
			inspectPlaygroundRule(california, { country: 'US', region: 'CA' })
				.resolution.status
		).toBe('matched');
		expect(
			inspectPlaygroundRule(california, { country: 'US', region: 'NY' })
				.resolution.status
		).toBe('no-match');
		const europe = toPolicyRule(
			fromPolicyRule(policyRulePresets.europeOptIn())
		);
		const unknown = inspectPlaygroundRule(europe, { country: '', region: '' });
		expect(unknown.resolution.status).toBe('matched');
		expect(
			unknown.resolution.status === 'matched' && unknown.resolution.matchedBy
		).toBe('fallback');
	});

	it('describes match blocks for humans', () => {
		expect(describeMatch({ regions: [{ country: 'US', region: 'CA' }] })).toBe(
			'regions US-CA'
		);
		expect(describeMatch({ isDefault: true })).toBe(
			'default when nothing else matches'
		);
		expect(describeMatch({})).toBe('matches nothing');
	});

	it('narrows position options to the container and drops invalid positions', () => {
		expect(positionOptionsFor('auto', 'choice')).toEqual(
			positionOptionsFor('card', 'choice')
		);
		expect(defaultContainerFor('notice')).toBe('card');
		expect(positionOptionsFor('auto', 'notice', 'banner')).toEqual([
			'bottom',
			'top',
		]);
		expect(positionOptionsFor('card', 'choice')).toEqual([
			'start',
			'end',
			'center',
		]);
		const card = setPresentationContainer(
			{ ...DEFAULT_PRESENTATION_FORM, position: 'end' },
			'card',
			'choice'
		);
		expect(card.position).toBe('end');
		const banner = setPresentationContainer(card, 'banner', 'choice');
		expect(banner.container).toBe('banner');
		expect(banner.position).toBe('auto');
		const drawer = setPresentationContainer(card, 'drawer', 'choice');
		expect(drawer.position).toBe('end');
	});

	it('turns the presentation form into host presentation only when set', () => {
		expect(toConsentPresentation(DEFAULT_PRESENTATION_FORM)).toBeUndefined();
		expect(
			toConsentPresentation({
				blockUntilChoice: true,
				container: 'banner',
				position: 'top',
			})
		).toEqual({
			prompt: {
				blockUntilChoice: true,
				container: { edge: 'top', type: 'banner' },
			},
		});
	});

	it('maps each shipped preset to a demo presentation by rule id', () => {
		const europe = policyRulePresets.europeOptIn();
		expect(presentationForRule(europe)).toEqual({
			container: { position: 'start', type: 'card' },
		});
		expect(presentationForRule(policyRulePresets.quebecOptIn())).toEqual({
			container: { position: 'center', type: 'card' },
		});
		expect(presentationForRule(policyRulePresets.californiaOptIn())).toEqual({
			container: { edge: 'bottom', type: 'banner' },
		});
		// No prompt means no banner; the toolbar is the persistent route.
		expect(
			presentationForRule(policyRulePresets.californiaOptOut())
		).toBeUndefined();
		expect(
			presentationForRule(policyRulePresets.worldOptOutNoPrompt())
		).toBeUndefined();
		// IAB surfaces are not mapped at all.
		expect(presentationForRule(policyRulePresets.europeIab())).toBeUndefined();
		expect('europe_iab' in DEMO_PRESENTATION_BY_RULE).toBe(false);
		expect(
			presentationForRule({ id: 'unknown', prompt: 'choice' })
		).toBeUndefined();
		// Every mapped shape resolves without diagnostics against its preset.
		for (const preset of playgroundPresets) {
			const prompt = presentationForRule(preset.rule);
			if (!prompt) {
				continue;
			}
			const inspection = inspectPlaygroundRule(
				preset.rule,
				{ country: preset.country, region: preset.region ?? '' },
				{ prompt }
			);
			expect(inspection.presentationDiagnostics).toEqual([]);
		}
	});

	it('treats a none rule as no consent UI in the demo map', () => {
		const worldNone = policyRulePresets.worldNone();
		expect(worldNone.model).toBe('none');
		expect(presentationForRule(worldNone)).toBeUndefined();
		expect('world_none' in DEMO_PRESENTATION_BY_RULE).toBe(true);
	});
	it('offers only a none prompt for the none model and drops choice-only fields', () => {
		expect(promptsForModel('none')).toEqual(['none']);
		const form = {
			...fromPolicyRule(policyRulePresets.europeOptIn()),
			model: 'none' as const,
			preselected: ['measurement' as const],
			prompt: 'none' as const,
		};
		const rule = toPolicyRule(form);
		expect(rule.model).toBe('none');
		expect(rule.prompt).toBe('none');
		expect(rule.actions).toBeUndefined();
		expect(rule.preselectedCategories).toBeUndefined();
		expect(
			inspectPlaygroundRule(rule, { country: 'US', region: 'SD' }).errors
		).toEqual([]);
	});
	it('emits a bare testing() for presets in the recommended pack', () => {
		expect([...RECOMMENDED_PRESET_IDS].sort()).toEqual(
			[
				'californiaOptOut',
				'europeOptIn',
				'quebecOptIn',
				'usPrivacyStatesOptOut',
				'worldNone',
			].sort()
		);
		expect(isRecommendedPreset('worldNone')).toBe(true);
		expect(isRecommendedPreset('californiaOptOut')).toBe(true);
		expect(isRecommendedPreset('californiaOptIn')).toBe(false);
		expect(isRecommendedPreset(null)).toBe(false);
		const recommended = buildProviderSnippet(
			policyRulePresets.worldNone(),
			'worldNone',
			undefined,
			{ recommended: true }
		);
		expect(recommended).toContain('mode: testing()');
		expect(recommended).toContain('recommended pack');
		expect(recommended).not.toContain('testing({ policy: policyRules })');
		expect(recommended).not.toContain('policyRulePresets');
		const explicit = buildProviderSnippet(
			policyRulePresets.californiaOptOut(),
			'californiaOptOut'
		);
		expect(explicit).toContain('testing({ policy: policyRules })');
		expect(explicit).toContain('policyRulePresets.californiaOptOut()');
		expect(
			buildBackendSnippet(policyRulePresets.worldNone(), 'worldNone', {
				recommended: true,
			})
		).toContain('policyRules: recommendedPolicyRules()');
	});
	it('gives any notice prompt the notice shape ahead of the id map', () => {
		const notice = toPolicyRule({
			...fromPolicyRule(policyRulePresets.californiaOptOut()),
			prompt: 'notice',
		});
		expect(presentationForRule(notice)).toBe(DEMO_NOTICE_PRESENTATION);
		expect(presentationForRule({ id: 'europe_opt_in', prompt: 'notice' })).toBe(
			DEMO_NOTICE_PRESENTATION
		);
		expect(autoContainerFor(notice)).toBe('card');
		expect(autoContainerFor(policyRulePresets.californiaOptIn())).toBe(
			'banner'
		);
		expect(autoContainerFor({ id: 'unmapped', prompt: 'choice' })).toBe(
			defaultContainerFor('choice')
		);
	});

	it('layers manual presentation fields over the demo map', () => {
		const quebec = policyRulePresets.quebecOptIn();
		const europe = policyRulePresets.europeOptIn();
		expect(
			resolvePlaygroundPresentation(DEFAULT_PRESENTATION_FORM, europe)
		).toEqual({ prompt: { container: { position: 'start', type: 'card' } } });
		// A manual container type drops the mapped position, which may not fit it.
		expect(
			resolvePlaygroundPresentation(
				{ ...DEFAULT_PRESENTATION_FORM, container: 'banner' },
				europe
			)
		).toEqual({ prompt: { container: { type: 'banner' } } });
		// A manual position keeps the mapped container type.
		expect(
			resolvePlaygroundPresentation(
				{ ...DEFAULT_PRESENTATION_FORM, position: 'end' },
				europe
			)
		).toEqual({ prompt: { container: { position: 'end', type: 'card' } } });
		expect(
			resolvePlaygroundPresentation(
				{ ...DEFAULT_PRESENTATION_FORM, blockUntilChoice: true },
				quebec
			)
		).toEqual({
			prompt: {
				blockUntilChoice: true,
				container: { position: 'center', type: 'card' },
			},
		});
		// Unmapped rules with an untouched form pass nothing to the provider.
		expect(
			resolvePlaygroundPresentation(DEFAULT_PRESENTATION_FORM, {
				id: 'unmapped',
				prompt: 'choice',
			})
		).toBeUndefined();
		// Position options follow the mapped container while the form is auto.
		expect(
			positionOptionsFor('auto', 'choice', autoContainerFor(quebec))
		).toEqual(['start', 'end', 'center']);
	});

	it('resolves the prompt surface and reports presentation diagnostics', () => {
		const rule = toPolicyRule(
			fromPolicyRule(policyRulePresets.californiaOptOut())
		);
		const notice = toPolicyRule({ ...fromPolicyRule(rule), prompt: 'notice' });
		const defaults = inspectPlaygroundRule(notice, {
			country: 'US',
			region: 'CA',
		});
		expect(defaults.presentation?.container?.desktop.placement).toBe(
			'card-start'
		);
		expect(defaults.presentationDiagnostics).toEqual([]);
		const blocked = inspectPlaygroundRule(
			notice,
			{ country: 'US', region: 'CA' },
			{
				prompt: {
					blockUntilChoice: true,
					container: { edge: 'top', type: 'banner' },
				},
			}
		);
		expect(blocked.presentation?.blocking).toBe(false);
		expect(blocked.presentation?.container?.desktop.placement).toBe(
			'banner-top'
		);
		const invalid = inspectPlaygroundRule(
			toPolicyRule({ ...fromPolicyRule(rule), prompt: 'none' }),
			{ country: 'US', region: 'CA' }
		);
		expect(invalid.presentation?.container?.desktop.placement).toBe(
			'card-start'
		);
	});

	it('emits the preset factory for untouched presets and JSON otherwise', () => {
		const rule = policyRulePresets.quebecOptIn();
		expect(buildProviderSnippet(rule, 'quebecOptIn')).toContain(
			'policyRulePresets.quebecOptIn()'
		);
		const custom = buildProviderSnippet({ ...rule, id: 'qc_custom' }, null);
		expect(custom).toContain('"id": "qc_custom"');
		expect(custom).not.toContain('legacyMaterial');
		expect(custom).not.toContain('review');
		expect(buildBackendSnippet(rule, 'quebecOptIn')).toContain(
			"from '@c15t/backend'"
		);
		expect(buildProviderSnippet(rule, 'quebecOptIn')).not.toContain(
			'presentation:'
		);
		expect(
			buildProviderSnippet(rule, 'quebecOptIn', {
				prompt: { container: { position: 'center', type: 'card' } },
			})
		).toContain(
			'presentation: {"prompt":{"container":{"position":"center","type":"card"}}}'
		);
		expect(buildProviderSnippet(rule, 'quebecOptIn')).not.toContain(
			'ConsentDialogTriggerToolbar'
		);
		const withToolbar = buildProviderSnippet(rule, 'quebecOptIn', undefined, {
			toolbar: true,
		});
		expect(withToolbar).toContain(
			"import { ConsentBanner, ConsentDialog, ConsentDialogTriggerToolbar, InthProvider } from '@inth/react';"
		);
		expect(withToolbar).toContain(
			"import { testing } from '@inth/react/testing';"
		);
		expect(withToolbar).toContain(
			'    <ConsentDialogTriggerToolbar showWhen="after-consent" />\n'
		);
	});
});
