import type {
	ConsentSnapshot,
	GlobalVendorList,
	NonIABVendor,
} from '@inth/sdk-core';
import {
	formatVendorMaxAge,
	mapCustomVendor,
	mapGvlVendor,
} from '@inth/sdk-iab/headless';
import type { HeadlessIABProcessedVendor } from '@inth/sdk-iab/headless';

import type { SurfaceCopy } from '../ui/copy';
import { h } from '../ui/dom';

type Vendor = GlobalVendorList['vendors'][number] | NonIABVendor;
type NamedItems = Record<number, { name: string; description?: string }>;

const duration = (value: number | null | undefined): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: undefined;

const createStorageDisclosures = (
	row: HeadlessIABProcessedVendor,
	copy: SurfaceCopy,
	standardRetention: number | undefined
): DocumentFragment => {
	const content = document.createDocumentFragment();
	const t = copy.t.iab.preferenceCenter.vendorList;
	if (row.usesCookies) {
		content.append(h('p', {}, t.usesCookies));
	}
	const maxAge = formatVendorMaxAge(
		row.cookieMaxAgeSeconds,
		row.cookieRefresh,
		t
	);
	if (maxAge) {
		content.append(h('p', {}, maxAge));
	}
	if (row.usesNonCookieAccess) {
		content.append(h('p', {}, t.nonCookieAccess));
	}
	if (standardRetention !== undefined) {
		content.append(
			h('p', {}, t.retention.replace('{days}', String(standardRetention)))
		);
	}
	return content;
};

const createPolicyLinks = (
	row: HeadlessIABProcessedVendor,
	copy: SurfaceCopy
): DocumentFragment => {
	const content = document.createDocumentFragment();
	const t = copy.t.iab.preferenceCenter.vendorList;
	const appendLink = (href: string | null | undefined, label: string): void => {
		if (href) {
			content.append(
				h(
					'p',
					{},
					h('a', { href, rel: 'noopener noreferrer', target: '_blank' }, label)
				)
			);
		}
	};
	appendLink(row.policyUrl, t.privacyPolicy);
	appendLink(row.legitimateInterestUrl, t.legitimateInterest);
	appendLink(row.deviceStorageDisclosureUrl, t.storageDisclosure);
	return content;
};

/**
 * The standard Features explanation, which TCF policy check 14 requires
 * wherever Features are shown. Falls back to the translated text when the
 * vendor list has none.
 */
const appendFeaturesStandardText = (
	content: DocumentFragment,
	snapshot: ConsentSnapshot,
	row: HeadlessIABProcessedVendor,
	copy: SurfaceCopy
): void => {
	if (!row.features.length) {
		return;
	}
	content.append(
		h(
			'p',
			{ 'data-testid': 'iab-vendor-features-standard-text' },
			snapshot.iab?.gvl?.standardTexts?.features ||
				copy.t.iab.preferenceCenter.features?.description ||
				''
		)
	);
};

/**
 * Render the vendor's declared policies, data use, storage, and retention.
 * Missing durations remain undisclosed rather than becoming zero days.
 *
 * @param snapshot - Current consent state containing the GVL definitions.
 * @param vendor - Registered or custom vendor to describe.
 * @param copy - Resolved translations and preferred language.
 * @returns Disclosure content to append after the vendor's consent controls.
 */
export const createVendorDisclosures = (
	snapshot: ConsentSnapshot,
	vendor: Vendor,
	copy: SurfaceCopy
): DocumentFragment => {
	const content = document.createDocumentFragment();
	const t = copy.t.iab.preferenceCenter.vendorList;
	const gvl = snapshot.iab?.gvl;
	const custom = 'privacyPolicyUrl' in vendor;
	const row = custom
		? mapCustomVendor(vendor)
		: mapGvlVendor(vendor.id, vendor, copy.language);
	const standardRetention = duration(
		custom ? vendor.dataRetentionDays : row.dataRetention?.stdRetention
	);
	const retention = row.dataRetention;
	content.append(createPolicyLinks(row, copy));

	const appendGroup = (
		title: string,
		ids: number[],
		names: NamedItems | undefined,
		retentionById?: Record<number, number>,
		fallbackRetention?: number
	): void => {
		if (!ids.length) {
			return;
		}
		content.append(
			h('h3', {}, title),
			h(
				'ul',
				{},
				...ids.map((id) => {
					const item = names?.[id];
					const days = duration(retentionById?.[id]) ?? fallbackRetention;
					return h(
						'li',
						{},
						h('span', {}, item?.name ?? String(id)),
						item?.description ? h('p', {}, item.description) : null,
						days === undefined
							? null
							: h(
									'p',
									{},
									(t.retainedDays ?? t.retention).replace(
										'{days}',
										String(days)
									)
								)
					);
				})
			)
		);
	};
	appendGroup(
		t.purposes,
		row.purposes,
		gvl?.purposes,
		retention?.purposes,
		standardRetention
	);
	appendGroup(
		t.legitimateInterest,
		row.legIntPurposes,
		gvl?.purposes,
		retention?.purposes,
		standardRetention
	);
	appendGroup(
		t.specialPurposes,
		row.specialPurposes,
		gvl?.specialPurposes,
		retention?.specialPurposes,
		standardRetention
	);
	appendGroup(t.features, row.features, gvl?.features);
	appendFeaturesStandardText(content, snapshot, row, copy);
	appendGroup(t.specialFeatures, row.specialFeatures, gvl?.specialFeatures);
	appendGroup(t.dataCategories, row.dataDeclaration ?? [], gvl?.dataCategories);
	content.append(createStorageDisclosures(row, copy, standardRetention));
	return content;
};
