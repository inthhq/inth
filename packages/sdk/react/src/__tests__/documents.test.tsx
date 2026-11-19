/**
 * `useDocuments()` checks and accepts a document through the provider's
 * backend, for the provider's subject.
 */
import type { ConsentKernel } from '@inth/sdk/engine';
import { writePolicyResolutionWire } from '@inth/sdk/schema/types';
import { hosted } from '@inth/sdk/transports';
import { useContext, useEffect } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { KernelContext } from '../context';
import { InthProvider, useDocuments } from '../index';
import type { RuntimeDocuments } from '../index';
import { policyFixture } from './policy-fixture';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

let kernel: ConsentKernel | null = null;
let documents: RuntimeDocuments | undefined;

const Capture = () => {
	const value = useContext(KernelContext);
	const bound = useDocuments();
	useEffect(() => {
		kernel = value;
		documents = bound;
	}, [value, bound]);
	return null;
};

afterEach(() => {
	localStorage.clear();
});

test('accepts for the provider subject, then checks as accepted', async () => {
	const posted: Record<string, unknown>[] = [];
	const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
		const { pathname } = new URL(String(input));
		if (pathname === '/v1/documents/acceptances') {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			posted.push(body);
			return Promise.resolve(
				Response.json({
					acceptances: [
						{ acceptedAt: 1, hash: HASH, type: 'terms_us', version: '1' },
					],
					subjectId: body.subjectId,
				})
			);
		}
		if (pathname === '/v1/documents/terms_us/current') {
			return Promise.resolve(
				Response.json({
					document: {
						effectiveDate: '2026-11-18T00:00:00.000Z',
						hash: HASH,
						id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
						isCurrent: true,
						requiresAcceptance: true,
						type: 'terms_us',
						version: '1',
					},
				})
			);
		}
		return Promise.resolve(
			Response.json({
				policyResolution: writePolicyResolutionWire(
					policyFixture().initialPolicyResolution
				),
			})
		);
	});
	await render(
		<InthProvider
			options={{
				mode: hosted({ fetch, projectUrl: 'https://consent.example.com' }),
				persistence: false,
			}}
		>
			<Capture />
		</InthProvider>
	);
	await vi.waitFor(() => expect(documents).toBeDefined());
	const subjectId = kernel?.getSnapshot().subject?.subjectId;

	await documents?.accept({ hash: HASH, type: 'terms_us' });
	const check = await documents?.check('terms_us');

	expect(posted).toHaveLength(1);
	expect(posted[0]?.subjectId).toBe(subjectId);
	expect(check?.accepted).toBe(true);
});
