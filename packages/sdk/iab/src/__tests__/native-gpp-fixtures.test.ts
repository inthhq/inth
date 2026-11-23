/**
 * Checks the GPP strings the native cores must produce
 * (`packages/native-protocol/gpp/cases.json`) against two independent sources: this
 * package's web encoder, given the same inputs, and the IAB reference decoder
 * (`@iabgpp/cmpapi`, a dev dependency only). Kotlin's `GppTest.kt` and Swift's
 * `GPPTests.swift` assert the same strings, so web, Android and iOS cannot drift
 * apart without one of the three suites failing.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GppModel } from '@iabgpp/cmpapi';
import { OPTIONAL_CONSENT_CATEGORIES } from '@inth/sdk-core';
import { readPolicyResolutionWire } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vitest';

import { encodeGPPString, encodeUSSection } from '../gpp/gpp-encoder.model';
import type { EncodedGPPSection, GPPFieldValues } from '../gpp/gpp-encoder.model';
import { TCF_EU_SECTION_ID, US_NATIONAL_SECTION } from '../gpp/gpp-sections.model';
import {
	resolveUSSectionDefinition,
	resolveUSSectionValues,
} from '../gpp/us-section.model';

const PROTOCOL = resolve(import.meta.dirname, '../../../../native-protocol');

interface ResolverInput {
	options: {
		mspaMode?: 'opt-out-option' | 'service-provider';
		optOutCategories?: string[];
		tcf?: boolean;
	} | null;
	policy: { model: string; rights: string[] } | null;
	resolution: string;
	ready: boolean;
	policyPending: boolean;
	location: string | null;
	overrideCountry: string | null;
	effectivePermissions: Record<string, boolean>;
	gpc: boolean;
	tcString: string | null;
}

interface Fixture {
	encoder: {
		id: string;
		sections: (
			| { id: 7; usnat: GPPFieldValues; gpc: boolean }
			| { id: number; encoded: string }
		)[];
		expected: string;
	}[];
	resolver: {
		id: string;
		input: ResolverInput;
		expected: {
			gppString: string | null;
			sectionIds: number[];
			usnat: (GPPFieldValues & { Gpc: boolean }) | null;
			storage: Record<string, string | number>;
		};
	}[];
}

const fixture = JSON.parse(
	readFileSync(resolve(PROTOCOL, 'gpp/cases.json'), 'utf8')
) as Fixture;

const storageBusCases = (
	JSON.parse(
		readFileSync(resolve(PROTOCOL, 'iab/storage-bus-cases.json'), 'utf8')
	) as {
		cases: { tcString: string; values: Record<string, string | number> }[];
	}
).cases;

/**
 * The web runtime's decision for the same inputs: the device-only gates
 * (GPP turned on, a ready snapshot under a matched rule), then the web
 * resolver with the national approach, since devices encode no state section.
 */
const webSections = function webSections(
	input: ResolverInput
): EncodedGPPSection[] {
	if (
		!(input.options && input.policy && input.ready) ||
		input.policyPending ||
		input.resolution !== 'matched'
	) {
		return [];
	}
	if (input.policy.model === 'iab') {
		return input.options.tcf !== false && input.tcString
			? [{ encoded: input.tcString, id: TCF_EU_SECTION_ID }]
			: [];
	}
	const snapshot = {
		effectivePermissions: { necessary: true, ...input.effectivePermissions },
		// The fixtures model no GPC mapping, so marketing decides the opt-out,
		// as on the native resolvers.
		evaluationPolicy: {
			gpcDenyCategories: [],
			scope: OPTIONAL_CONSENT_CATEGORIES,
		},
		location: { countryCode: input.location, regionCode: null },
		optOut: null,
		overrides: input.overrideCountry ? { country: input.overrideCountry } : {},
		policyRule: input.policy,
		privacySignals: { gpc: { active: input.gpc } },
	} as unknown as Parameters<typeof resolveUSSectionValues>[1] &
		Parameters<typeof resolveUSSectionDefinition>[0];
	const definition = resolveUSSectionDefinition(snapshot, 'national');
	if (!definition) {
		return [];
	}
	const values = resolveUSSectionValues(definition, snapshot, {
		mspaMode: input.options.mspaMode,
		optOutCategories: input.options.optOutCategories as never,
	});
	return [{ encoded: encodeUSSection(definition, values), id: definition.id }];
};

/** The in-app rows for a GPP string, built from the web output and the TCF bus oracle. */
const expectedStorage = function expectedStorage(
	sections: EncodedGPPSection[],
	gppString: string | null,
	tcString: string | null
): Record<string, string | number> {
	if (gppString === null) {
		return {};
	}
	const ids = sections
		.map((section) => section.id)
		.sort((left, right) => left - right)
		.join('_');
	const rows: Record<string, string | number> = {
		IABGPP_GppSID: ids,
		IABGPP_HDR_GppString: gppString,
		IABGPP_HDR_Sections: ids,
		IABGPP_HDR_Version: '1',
	};
	for (const section of sections) {
		rows[`IABGPP_${section.id}_String`] = section.encoded;
	}
	const tcf = sections.some((section) => section.id === TCF_EU_SECTION_ID)
		? storageBusCases.find((row) => row.tcString === tcString)
		: undefined;
	if (tcf && tcString) {
		rows.IABGPP_2_TCString = tcString;
		rows.IABGPP_TCFEU2_gdprApplies = 1;
		for (const [key, value] of Object.entries(tcf.values)) {
			if (key !== 'IABTCF_TCString' && key !== 'IABTCF_DisclosedVendors') {
				const mapped =
					key === 'IABTCF_UseNonStandardTexts'
						? 'IABGPP_TCFEU2_UseNonStandardStacks'
						: key.replace('IABTCF_', 'IABGPP_TCFEU2_');
				rows[mapped] = value;
			}
		}
	}
	return rows;
};

/** The US National fields the reference decoder reads back, or `null`. */
const decodedUSNational = function decodedUSNational(
	gppString: string | null,
	names: readonly string[]
): Record<string, unknown> | null {
	if (gppString === null || names.length === 0) {
		return null;
	}
	const decoded = new GppModel(gppString);
	return Object.fromEntries(
		names.map((name) => [name, decoded.getFieldValue('usnat', name)])
	);
};

describe('native GPP fixtures', () => {
	test.each(fixture.encoder.map((entry) => [entry.id, entry] as const))(
		'encoder case %s matches the web encoder and the IAB reference',
		(_, entry) => {
			const sections = entry.sections.map((section) =>
				'usnat' in section
					? {
							encoded: encodeUSSection(US_NATIONAL_SECTION, {
								core: section.usnat,
								gpc: section.gpc,
							}),
							id: section.id,
						}
					: section
			);
			expect(encodeGPPString(sections)).toBe(entry.expected);
			expect(new GppModel(entry.expected).encode()).toBe(entry.expected);

			const usnat = entry.sections.find((section) => 'usnat' in section);
			const want =
				usnat && 'usnat' in usnat ? { ...usnat.usnat, Gpc: usnat.gpc } : {};
			expect(
				decodedUSNational(entry.expected, Object.keys(want)) ?? {}
			).toEqual(want);
		}
	);

	test.each(fixture.resolver.map((entry) => [entry.id, entry] as const))(
		'resolver case %s matches the web resolver and the IAB reference',
		(_, entry) => {
			const sections = webSections(entry.input);
			const gppString = encodeGPPString(sections) || null;
			expect(gppString).toBe(entry.expected.gppString);
			expect(sections.map((section) => section.id)).toEqual(
				entry.expected.sectionIds
			);
			expect(
				gppString === null ? [] : new GppModel(gppString).getSectionIds()
			).toEqual(entry.expected.sectionIds);
			expect(
				decodedUSNational(gppString, Object.keys(entry.expected.usnat ?? {}))
			).toEqual(entry.expected.usnat);
			expect(entry.expected.storage).toEqual(
				expectedStorage(sections, gppString, entry.input.tcString)
			);
		}
	);
});

const rightsCases = (
	JSON.parse(
		readFileSync(resolve(PROTOCOL, 'gpp/policy-rights-cases.json'), 'utf8')
	) as {
		cases: {
			id: string;
			policyResolution: unknown;
			expected:
				| { accepted: true; rights: string[] }
				| { accepted: false; reason: string };
		}[];
	}
).cases;

describe('native policy rights fixtures', () => {
	test.each(rightsCases.map((entry) => [entry.id, entry] as const))(
		'%s reads as @inth/sdk/schema reads it',
		(_, entry) => {
			const read = readPolicyResolutionWire(entry.policyResolution);
			expect(
				read.status === 'matched'
					? { accepted: true, rights: read.policy.rights }
					: { accepted: false, reason: read.reason }
			).toEqual(entry.expected);
		}
	);
});
