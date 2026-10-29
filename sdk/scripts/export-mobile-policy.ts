import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { narrowGVLToVendors } from '../packages/iab/src/tcf/fetch-gvl';
import {
	parseConsentManifest,
	resolvePolicyResolutionFromManifest,
	writePolicyResolutionWire,
	getTranslationsData,
	parseAdTechProviderList,
	adTechProviderListUrl,
} from '../packages/schema/dist/index.js';
import { enTranslations } from '../packages/translations/dist/index.js';

const exportDisclosures = async (
	manifest: ReturnType<typeof parseConsentManifest>,
	get: (url: string) => Promise<Response>,
	vendors: number[] | undefined,
	now: number
): Promise<Record<string, unknown>> => {
	const disclosures: Record<string, unknown> = {};
	if (manifest.iab?.enabled) {
		if (!manifest.iab.gvl) {
			throw new Error('IAB requires a GVL disclosure endpoint.');
		}
		const response = await get(manifest.iab.gvl.url);
		const data = await response.json();
		// Authority uses the source timestamp, never the time this export ran.
		const fetchedAt = Date.parse(data.lastUpdated);
		if (
			!Number.isFinite(fetchedAt) ||
			fetchedAt > now ||
			!Number.isSafeInteger(data.vendorListVersion) ||
			!Number.isSafeInteger(data.tcfPolicyVersion) ||
			!data.purposes ||
			!data.vendors
		) {
			throw new Error(
				'GVL requires valid original lastUpdated, versions and disclosure content.'
			);
		}
		disclosures.gvl = {
			data: narrowGVLToVendors(data, vendors ?? []),
			fetchedAt,
		};
		const ac = manifest.iab.additionalConsent;
		if (ac) {
			const atpResponse = await get(
				adTechProviderListUrl(ac.url, ac.providers)
			);
			const atpData = await atpResponse.json();
			const providers = parseAdTechProviderList(atpData, ac.providers);
			const atpFetchedAt = Date.parse(
				atpResponse.headers.get('last-modified') ?? atpData.lastUpdated
			);
			if (
				!providers ||
				!Number.isFinite(atpFetchedAt) ||
				atpFetchedAt > now ||
				ac.providers.some((id) => !providers.some((p) => p.id === id))
			) {
				throw new Error(
					'ATP disclosure needs every configured provider and an original Last-Modified/lastUpdated timestamp.'
				);
			}
			disclosures.atp = {
				fetchedAt: atpFetchedAt,
				providers: providers.filter((p) => ac.providers.includes(p.id)),
			};
		}
	}
	return disclosures;
};

/** Build-only policy export. No visitor-specific /init state enters this file. */
export const exportMobilePolicy = async (options: {
	endpoint: string;
	expiresAt: number;
	languages?: string[];
	vendors?: number[];
	now?: number;
	fetch?: typeof globalThis.fetch;
	/** Only deterministic loopback app tests may disable TLS. */
	testOnlyAllowLoopback?: boolean;
}): Promise<string> => {
	const endpoint = options.endpoint.replace(/\/+$/u, '');
	const now = options.now ?? Date.now();
	const fetcher = options.fetch ?? globalThis.fetch;
	const get = async (url: string) => {
		const parsed = new URL(url);
		if (
			parsed.username ||
			parsed.password ||
			parsed.hash ||
			(parsed.protocol !== 'https:' &&
				!(
					options.testOnlyAllowLoopback &&
					parsed.protocol === 'http:' &&
					['localhost', '127.0.0.1'].includes(parsed.hostname)
				))
		) {
			throw new Error(
				'Policy export requires TLS without credentials or fragments.'
			);
		}
		const response = await fetcher(url, {
			headers: { accept: 'application/json', 'x-c15t-policy-contract': '1' },
			redirect: 'error',
			signal: AbortSignal.timeout(15000),
		});
		if (!response.ok) {
			throw new Error(`Policy export HTTP ${response.status}: ${url}`);
		}
		return response;
	};
	if (
		!Number.isSafeInteger(now) ||
		now < 0 ||
		!Number.isSafeInteger(options.expiresAt) ||
		options.expiresAt <= now
	) {
		throw new Error(
			'expiresAt must be an explicit future epoch millisecond timestamp.'
		);
	}
	const manifest = parseConsentManifest(
		await (await get(`${endpoint}/manifest`)).json()
	);
	const unknown = resolvePolicyResolutionFromManifest(manifest, {
		countryCode: null,
		regionCode: null,
	});
	if (
		unknown.status !== 'matched' ||
		!['opt-in', 'iab'].includes(unknown.policy.model) ||
		unknown.policy.prompt !== 'choice' ||
		unknown.policy.preselectedCategories.length > 0
	) {
		throw new Error(
			'Hosted manifest needs an authored conservative opt-in choice fallback/default for unknown geography.'
		);
	}
	const languages = [
		...new Set(
			['en', ...(options.languages ?? [])]
				.map((language) => language.trim().toLowerCase().split('-')[0])
				.filter((language): language is string => Boolean(language))
		),
	];
	const policyPacks =
		manifest.policyPacks?.map((pack) => ({
			match: pack.match,
			policyResolution: writePolicyResolutionWire({
				fingerprints: pack.fingerprints,
				matchedBy: 'default',
				policy: pack.rule,
				policyId: pack.rule.id,
				status: 'matched',
			}),
			translations: Object.fromEntries(
				languages.map((language) => [
					language,
					getTranslationsData(
						language,
						manifest.translations?.customTranslations,
						{
							baseTranslations: { en: enTranslations },
							i18n: manifest.translations?.i18n,
							policyI18n: pack.rule.i18n,
						}
					),
				])
			),
		})) ?? [];
	const disclosures = await exportDisclosures(
		manifest,
		get,
		options.vendors,
		now
	);
	const payload = JSON.stringify({
		defaultLanguage: 'en',
		disclosures,
		endpoint,
		expiresAt: options.expiresAt,
		issuedAt: now,
		manifestRevision: manifest.revision,
		policyPacks,
		requiresAtp: (manifest.iab?.additionalConsent?.providers.length ?? 0) > 0,
		schemaVersion: 1,
		tenantId: manifest.tenantId,
	});
	return `${JSON.stringify(
		{ payload, sha256: createHash('sha256').update(payload).digest('hex') },
		null,
		2
	)}\n`;
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { values } = parseArgs({
		options: {
			endpoint: { type: 'string' },
			'expires-at': { type: 'string' },
			languages: { type: 'string' },
			out: { type: 'string' },
			vendors: { type: 'string' },
		},
	});
	if (!values.endpoint || !values.out || !values['expires-at']) {
		throw new Error(
			'Use --endpoint https://your-project.inth.app --out c15t-policy.json --expires-at <ISO timestamp>.'
		);
	}
	await writeFile(
		values.out,
		await exportMobilePolicy({
			endpoint: values.endpoint,
			expiresAt: Date.parse(values['expires-at']),
			languages: values.languages?.split(','),
			vendors: values.vendors?.split(',').map(Number),
		})
	);
}
