/**
 * `useDocuments()` under a deferred root asks for the engine and settles
 * with it: a call rejects when the engine fails to load, instead of
 * waiting for good.
 */
import type { KernelConfig } from '@inth/sdk/engine';
import type { RuntimeDocuments } from '@inth/sdk/runtime/documents';
import { Suspense, useEffect } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import {
	deferred,
	fulfilledThenable,
	streamPage,
} from '../../__tests__/streamed-ssr-harness';
import type { StreamedPage } from '../../__tests__/streamed-ssr-harness';
import { useDocuments } from '../../documents';
import { InthProvider } from '../../index';
import { readConsentBoot } from '../boot';
import type { ConsentBoot } from '../boot';
import { ServerBootData } from '../boot-data';
import type * as EngineNamespace from '../engine';
import { DeferredConsentShell } from '../shell';

type EngineModule = typeof EngineNamespace;

const consentCategories = ['necessary', 'marketing'] as const;
const mode = transportMode({ init: () => Promise.resolve({}) });
const config = (): KernelConfig => ({
	...policyFixture(),
	now: Date.now(),
});
const providerOptions = (prefetch: unknown) => ({
	consentCategories,
	mode,
	persistence: false as const,
	prefetch: prefetch as KernelConfig,
});

let documents: RuntimeDocuments | undefined;
const Capture = () => {
	const bound = useDocuments();
	useEffect(() => {
		documents = bound;
	}, [bound]);
	return null;
};

const ServerPage = ({ prefetch }: { prefetch: unknown }) => (
	<html lang="en">
		<head />
		<body>
			<InthProvider options={providerOptions(prefetch)}>
				<Suspense fallback={null}>
					<ServerBootData />
				</Suspense>
			</InthProvider>
		</body>
	</html>
);

const ClientPage = ({
	boot,
	loadEngine,
	prefetch,
}: {
	boot: ConsentBoot;
	loadEngine: () => Promise<EngineModule>;
	prefetch: unknown;
}) => (
	<html lang="en">
		<head />
		<body>
			<DeferredConsentShell
				boot={boot}
				defer
				loadEngine={loadEngine}
				options={{ consentCategories }}
				prefetch={prefetch}
				renderEngine={(engine: EngineModule, attach, committed) => (
					<engine.DeferredEngineHost
						attach={attach}
						committed={committed}
						options={providerOptions(prefetch)}
					/>
				)}
				schedule={() => () => undefined}
			>
				<Capture />
			</DeferredConsentShell>
		</body>
	</html>
);

let page: StreamedPage | undefined;

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	documents = undefined;
});

afterEach(() => {
	page?.dispose();
	page = undefined;
});

test('a call rejects when the engine fails to load', async () => {
	const state = config();
	const server = deferred<KernelConfig>();
	page = await streamPage(<ServerPage prefetch={server.promise} />);
	server.resolve(state);
	await page.finish();
	const boot = readConsentBoot(page.doc) as ConsentBoot;
	const failure = new TypeError('Failed to fetch chunk');
	const loadEngine = vi.fn(() => Promise.reject(failure));
	const hydrated = await page.hydrate(
		<ClientPage
			boot={boot}
			loadEngine={loadEngine}
			prefetch={fulfilledThenable(state)}
		/>
	);
	await vi.waitFor(() => expect(documents).toBeDefined());
	expect(loadEngine).not.toHaveBeenCalled();

	await expect(documents?.check('terms_us')).rejects.toBe(failure);
	expect(loadEngine).toHaveBeenCalled();
	await hydrated.unmount();
});
