/**
 * Writes `native/protocol/bundled-policy/invalid-resources.json`: variants of the
 * shared bundled-policy resources that a native core cannot use.
 *
 * Each case is refused outright (`refused`) or loads without a usable IAB vendor
 * list (`no-usable-gvl`). Both native cores read this file and must agree, and
 * the CLI's resource check, which guards export and stale-copy reuse, must find
 * a problem in every case. Cases marked `structural` need no policy-wire or
 * matcher knowledge, so the Expo plugin's embed check must refuse them too.
 *
 * Usage: `bun scripts/generate-bundled-resource-fixtures.ts [output-dir]`
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(
	new URL('../native/protocol/bundled-policy', import.meta.url)
);
type Payload = Record<string, unknown>;
type Base = 'iab' | 'parity';
const bases = Object.fromEntries(
	(['iab', 'parity'] as const).map((name) => {
		const source = JSON.parse(
			readFileSync(join(directory, `${name}.json`), 'utf8')
		) as { endpoint: string; now: number; resource: { payload: string } };
		return [name, source];
	})
) as Record<
	Base,
	{ endpoint: string; now: number; resource: { payload: string } }
>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value));
const wrap = (payload: string) => ({
	payload,
	sha256: createHash('sha256').update(payload).digest('hex'),
});

interface Case {
	name: string;
	base: Base;
	expect: 'refused' | 'no-usable-gvl';
	structural: boolean;
	/** Edit the decoded payload; the wrapper and checksum are rebuilt after. */
	payload?: (payload: Payload) => void;
	/** Replace the wrapper outright, for wrapper-level faults. */
	wrapper?: (payload: string) => unknown;
}

const packs = (payload: Payload) => payload.policyPacks as Payload[];
const policy = (pack: Payload) =>
	(pack.policyResolution as Payload).policy as Payload;
const isUnknownLocationPack = (pack: Payload) => {
	const match = pack.match as Payload;
	return match.fallback === true || match.isDefault === true;
};
const gvl = (payload: Payload) =>
	((payload.disclosures as Payload).gvl as Payload).data as Payload;

const cases: Case[] = [
	{
		base: 'parity',
		expect: 'refused',
		name: 'wrapper with an extra key',
		structural: true,
		wrapper: (p) => ({ ...wrap(p), signature: 'x' }),
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'checksum of other bytes',
		structural: true,
		wrapper: (p) => ({ payload: p, sha256: '0'.repeat(64) }),
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'payload that is not a string',
		structural: true,
		wrapper: (p) => ({ payload: JSON.parse(p), sha256: '0'.repeat(64) }),
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'schema version 2',
		payload: (p) => {
			p.schemaVersion = 2;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'unknown payload key',
		payload: (p) => {
			p.subjectId = 'sub_1';
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'another endpoint',
		payload: (p) => {
			p.endpoint = 'https://other.example.test';
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'issued in the future',
		payload: (p) => {
			p.issuedAt = Number(p.issuedAt) + 60_000;
			p.expiresAt = Number(p.expiresAt) + 60_000;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'expires before it was issued',
		payload: (p) => {
			p.expiresAt = (p.issuedAt as number) - 1;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'expires when it was issued',
		payload: (p) => {
			p.expiresAt = p.issuedAt;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'negative issue time',
		payload: (p) => {
			p.issuedAt = -1;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'fractional issue time',
		payload: (p) => {
			p.issuedAt = Number(p.issuedAt) - 0.5;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'empty manifest revision',
		payload: (p) => {
			p.manifestRevision = '';
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'missing manifest revision',
		payload: (p) => {
			delete p.manifestRevision;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'numeric manifest revision',
		payload: (p) => {
			p.manifestRevision = 7;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'no policy packs',
		payload: (p) => {
			p.policyPacks = [];
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'missing default language',
		payload: (p) => {
			delete p.defaultLanguage;
		},
		structural: true,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'unreadable policy wire',
		payload: (p) => {
			(packs(p)[0] as Payload).policyResolution = { status: 'matched' };
		},
		structural: false,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'no rule for an unknown location',
		payload: (p) => {
			p.policyPacks = packs(p).filter((pack) => !isUnknownLocationPack(pack));
		},
		structural: false,
	},
	{
		base: 'parity',
		expect: 'refused',
		name: 'unknown-location rule that preselects',
		payload: (p) => {
			for (const pack of packs(p).filter(isUnknownLocationPack)) {
				policy(pack).preselectedCategories = ['measurement'];
			}
		},
		structural: false,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'vendor list version 0',
		payload: (p) => {
			gvl(p).vendorListVersion = 0;
		},
		structural: true,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'TCF policy version 0',
		payload: (p) => {
			gvl(p).tcfPolicyVersion = 0;
		},
		structural: true,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'purposes that are a string',
		payload: (p) => {
			gvl(p).purposes = 'all';
		},
		structural: true,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'vendors that are a string',
		payload: (p) => {
			gvl(p).vendors = 'all';
		},
		structural: true,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'vendor list fetched after issue',
		payload: (p) => {
			((p.disclosures as Payload).gvl as Payload).fetchedAt =
				(p.issuedAt as number) + 1;
		},
		structural: true,
	},
	{
		base: 'iab',
		expect: 'no-usable-gvl',
		name: 'vendor list without a fetch time',
		payload: (p) => {
			delete ((p.disclosures as Payload).gvl as Payload).fetchedAt;
		},
		structural: true,
	},
];

const fixture = {
	cases: cases.map((entry) => {
		const source = bases[entry.base];
		const payload = JSON.parse(source.resource.payload) as Payload;
		entry.payload?.(payload);
		const text = JSON.stringify(payload);
		return {
			base: entry.base,
			endpoint: source.endpoint,
			expect: entry.expect,
			name: entry.name,
			now: source.now,
			resource: clone(entry.wrapper ? entry.wrapper(text) : wrap(text)),
			structural: entry.structural,
		};
	}),
};

const output = process.argv[2] ?? directory;
mkdirSync(output, { recursive: true });
writeFileSync(
	join(output, 'invalid-resources.json'),
	`${JSON.stringify(fixture, null, '\t')}\n`
);
