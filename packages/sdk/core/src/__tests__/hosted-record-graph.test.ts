/// <reference types="node" />
/**
 * The hosted record transport ships to every Next.js page that renders
 * `ConsentRoot`, because saves go through it. Init never runs on those pages
 * when the server resolved the visitor's state, and a subject record is only
 * read back after a user switch. A static import of the init path or the
 * subject-record reviver would put their bytes back into every first load.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test, vi } from 'vitest';

import { createHostedRecordTransport } from '../transports/hosted-records';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const STATIC_VALUE_IMPORT =
	/^(?:import|export)\s+(?!type\b)(?:\{(?<names>[^}]*)\}|[^;]*?)\s*from\s+'(?<specifier>[^']+)';/gmu;

const resolveRelative = function resolveRelative(
	from: string,
	specifier: string
): string {
	const base = normalize(join(dirname(from), specifier));
	for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error(`Cannot resolve ${specifier} from ${from}`);
};

/** Source files and bare-specifier imports reachable through value imports. */
const staticGraph = function staticGraph(entry: string): {
	files: string[];
	packageImports: string[];
} {
	const files = new Set<string>();
	const packageImports = new Set<string>();
	const pending = [join(SOURCE_DIR, entry)];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (files.has(file)) {
			continue;
		}
		files.add(file);
		for (const match of readFileSync(file, 'utf8').matchAll(
			STATIC_VALUE_IMPORT
		)) {
			const specifier = match.groups?.specifier as string;
			if (specifier.startsWith('.')) {
				pending.push(resolveRelative(file, specifier));
				continue;
			}
			for (const name of (match.groups?.names ?? '').split(',')) {
				const [imported] = name.trim().split(/\s+as\s+/u);
				if (imported && !imported.startsWith('type ')) {
					packageImports.add(`${specifier}#${imported}`);
				}
			}
		}
	}
	return {
		files: [...files].map((file) => file.slice(SOURCE_DIR.length + 1)),
		packageImports: [...packageImports],
	};
};

describe('hosted record transport graph', () => {
	test.each([
		'transports/v1/records.ts',
		'transports/v1/init-request.ts',
		'libs/prefetch/window-key.ts',
	])('%s reaches no init-path module', (entry) => {
		const { files, packageImports } = staticGraph(entry);
		expect(files).not.toContain('transports/v1/hosted.ts');
		expect(files).not.toContain('transports/init-output.ts');
		expect(files).not.toContain('libs/request-context.ts');
		expect(files).not.toContain('libs/prefetch/prefetch.ts');
		expect(packageImports).not.toContain(
			'@inth/sdk/schema/types#extractConsentRequestInputs'
		);
	});

	test.each(['index.ts', 'transports/index.ts', 'runtime/client-mode.ts'])(
		'%s does not load every language, as the server resolvers do',
		(entry) => {
			const { packageImports } = staticGraph(entry);
			expect(
				packageImports.filter((name) =>
					name.startsWith('@inth/sdk-translations/all#')
				)
			).toEqual([]);
		}
	);

	test.each(['index.ts', 'runtime/index.ts', 'runtime/client-mode.ts'])(
		'%s does not reach the testing transport or the offline transport',
		(entry) => {
			const { files } = staticGraph(entry);

			expect(files).not.toContain('transports/testing.ts');
			expect(files).not.toContain('transports/offline.ts');
		}
	);
});

describe('createHostedRecordTransport', () => {
	const savePayload = {
		choice: { categories: {}, version: 3 },
		confirmed: { actionAt: 1_700_000_000_000, categories: {} },
		consentAction: 'all',
		consents: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		model: 'opt-in',
		overrides: {},
		policySnapshotToken: null,
		subject: { subjectId: 'sub_1' },
		subjectId: 'sub_1',
		uiSource: 'banner',
		user: null,
	} as const;

	const jsonResponse = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			headers: { 'content-type': 'application/json' },
			status,
		});

	test('saves without a decision source post the payload decision inputs', async () => {
		const fetch = vi.fn(() =>
			Promise.resolve(jsonResponse({ subjectId: 'sub_1' }))
		);
		const records = createHostedRecordTransport({
			domain: 'example.com',
			fetch,
			projectUrl: 'https://consent.example.com/',
		});

		const result = await records.save({
			...savePayload,
			decisionInputs: {
				country: 'DE',
				fingerprint: 'fp',
				gpc: false,
				language: 'en',
				policyId: 'gdpr',
				region: null,
			},
		});

		expect(result).toEqual({ ok: true, subjectId: 'sub_1' });
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://consent.example.com/subjects');
		expect(JSON.parse(String(init.body))).toMatchObject({
			country: 'DE',
			domain: 'example.com',
			fingerprint: 'fp',
			policyId: 'gdpr',
		});
	});

	test('a required decision refuses a save that carries none', async () => {
		const fetch = vi.fn();
		const records = createHostedRecordTransport(
			{ fetch, projectUrl: '/api/inth' },
			{ inputs: () => undefined, pending: () => undefined, required: true }
		);

		await expect(records.save(savePayload)).rejects.toThrow(
			'cannot save before init resolved a policy decision'
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('reads a subject record back through the lazily loaded reviver', async () => {
		const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
			Promise.resolve(jsonResponse({}, 404))
		);
		const records = createHostedRecordTransport({
			fetch,
			projectUrl: '/api/inth',
		});

		await expect(records.loadSubjectRecord('sub_1')).resolves.toBeNull();
		expect(fetch.mock.calls[0]?.[0]).toBe('/api/inth/subjects/sub_1');
	});
});
