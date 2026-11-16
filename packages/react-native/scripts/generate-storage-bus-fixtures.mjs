import { readFileSync, writeFileSync } from 'node:fs';

import { TCString } from '@iabtechlabtcf/core';

// Development oracle. See IAB CMP API v2's in-app table and the reference
// cmpapi/src/response/InAppTCData.ts for '_' in restriction gaps.
export const storageBusCases = () => {
	const cases = [];
	for (const file of ['commit-cases', 'authority-oracle']) {
		const source = JSON.parse(
			readFileSync(
				new URL(`../../../native/protocol/iab/${file}.json`, import.meta.url),
				'utf8'
			)
		);
		for (const row of source.cases) {
			const m = TCString.decode(row.tcString);
			const bits = (vector, width = vector.maxId) =>
				Array.from({ length: width }, (_, i) =>
					vector.has(i + 1) ? '1' : '0'
				).join('');
			const values = {
				IABTCF_CmpSdkID: m.cmpId,
				IABTCF_CmpSdkVersion: m.cmpVersion,
				IABTCF_DisclosedVendors: bits(m.vendorsDisclosed),
				IABTCF_PolicyVersion: m.policyVersion,
				IABTCF_PublisherCC: m.publisherCountryCode,
				IABTCF_PurposeConsents: bits(m.purposeConsents, 24),
				IABTCF_PurposeLegitimateInterests: bits(
					m.purposeLegitimateInterests,
					24
				),
				IABTCF_PurposeOneTreatment: Number(m.purposeOneTreatment),
				IABTCF_SpecialFeaturesOptIns: bits(m.specialFeatureOptins, 12),
				IABTCF_TCString: row.tcString,
				IABTCF_UseNonStandardTexts: Number(m.useNonStandardTexts),
				IABTCF_VendorConsents: bits(m.vendorConsents),
				IABTCF_VendorLegitimateInterests: bits(m.vendorLegitimateInterests),
			};
			// Segment 3 is optional. Never manufacture publisher state when absent.
			const alphabet =
				'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
			const hasPublisher = row.tcString
				.split('.')
				.some(
					(segment, i) =>
						i > 0 && Math.floor(alphabet.indexOf(segment[0]) / 8) === 3
				);
			if (hasPublisher) {
				Object.assign(values, {
					IABTCF_PublisherConsent: bits(m.publisherConsents, 24),
					IABTCF_PublisherCustomPurposesConsents: bits(
						m.publisherCustomConsents,
						m.numCustomPurposes
					),
					IABTCF_PublisherCustomPurposesLegitimateInterests: bits(
						m.publisherCustomLegitimateInterests,
						m.numCustomPurposes
					),
					IABTCF_PublisherLegitimateInterests: bits(
						m.publisherLegitimateInterests,
						24
					),
				});
			}
			const restrictions = m.publisherRestrictions;
			const width = restrictions.getMaxVendorId();
			for (const r of restrictions.getRestrictions()) {
				const key = `IABTCF_PublisherRestrictions${r.purposeId}`;
				const value = (values[key] ?? '_'.repeat(width)).split('');
				for (let id = 1; id <= width; id += 1) {
					if (
						restrictions.getRestrictionType(id, r.purposeId) ===
						r.restrictionType
					) {
						value[id - 1] = String(r.restrictionType);
					}
				}
				values[key] = value.join('');
			}
			cases.push({ id: `${file}-${row.id}`, tcString: row.tcString, values });
		}
	}
	return {
		cases,
		oracle:
			'@iabtechlabtcf/core 1.5.22, IAB CMP API v2 in-app table, reference InAppTCData restrictions',
	};
};

if (process.argv[1]?.endsWith('generate-storage-bus-fixtures.mjs')) {
	writeFileSync(
		process.argv[2] ??
			new URL(
				'../../../native/protocol/iab/storage-bus-cases.json',
				import.meta.url
			),
		`${JSON.stringify(storageBusCases(), null, '\t')}\n`
	);
}
