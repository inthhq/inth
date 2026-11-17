/**
 * The provider contract: one handshake for the whole tree, and a hard stop
 * when the embedded binary cannot speak the protocol.
 *
 * Rendered with `react-dom` in a DOM; the TurboModule behind it is the fake
 * module, reached through the faithful `react-native` stub the package's
 * Vitest config aliases in.
 */

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test } from 'vitest';

import {
	captureErrorMessage,
	createFakeNativeModule,
	FAKE_BOOTSTRAP,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import {
	emitterState,
	resetNativeStub,
	setNativeModule,
} from '../../__tests__/helpers/react-native-stub';
import { useInthBootstrap } from '../../hooks/use-inth-bootstrap';
import { useSnapshot } from '../../hooks/use-snapshot';
import { createConsentClient, resetConsentClient } from '../../native/client';
import { NATIVE_INTH_MODULE_NAME } from '../../protocol';
import { buildFakeSnapshot } from '../../testing/fake-native-inth';
import { ConsentProvider } from '../consent-provider';

/** Render the revision, so a test can see which consumers updated. */
const RevisionProbe = (): ReactNode => {
	const snapshot = useSnapshot();

	return <span>{`r${String(snapshot.revision)}`}</span>;
};

/** Render the handshake payload the provider read once. */
const BootstrapProbe = (): ReactNode => {
	const bootstrap = useInthBootstrap();

	return (
		<span>{`${bootstrap.nativeSdkVersion}/${String(bootstrap.protocolVersion)}`}</span>
	);
};

/** Five children under one provider. */
const FiveConsumers = (): ReactNode => (
	<>
		{Array.from({ length: 5 }, (_unused, index) => (
			<RevisionProbe key={index} />
		))}
	</>
);

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
});

describe('handshake', () => {
	test('calls getBootstrap once for five mounted consumers', () => {
		const fake = createFakeNativeModule();

		const tree = renderTree(
			<ConsentProvider autoPresent={false}>
				<FiveConsumers />
			</ConsentProvider>
		);

		expect(fake.bootstrapCalls).toBe(1);
		expect(tree.text()).toBe('r0r0r0r0r0');

		tree.unmount();
	});

	test('calls getBootstrap once for five separate providers', () => {
		const fake = createFakeNativeModule();

		const tree = renderTree(
			<>
				{Array.from({ length: 5 }, (_unused, index) => (
					<ConsentProvider
						autoPresent={false}
						key={index}
					>
						<RevisionProbe />
					</ConsentProvider>
				))}
			</>
		);

		expect(fake.bootstrapCalls).toBe(1);
		expect(tree.text()).toBe('r0r0r0r0r0');

		tree.unmount();
	});

	test('a nested provider reuses the ancestor client and adds no emitter', () => {
		const fake = createFakeNativeModule();
		const single = renderTree(
			<ConsentProvider autoPresent={false}>
				<RevisionProbe />
			</ConsentProvider>
		);
		// The client's own, and the presenter ledger's, which lives as long as the client.
		const perClient = emitterState.instances;
		single.unmount();
		resetConsentClient();
		emitterState.instances = 0;

		const tree = renderTree(
			<ConsentProvider autoPresent={false}>
				<ConsentProvider autoPresent={false}>
					<RevisionProbe />
				</ConsentProvider>
			</ConsentProvider>
		);

		expect(fake.bootstrapCalls).toBe(2);
		expect(emitterState.instances).toBe(perClient);

		tree.unmount();
	});

	test('publishes the handshake payload to the tree', () => {
		createFakeNativeModule();

		const tree = renderTree(
			<ConsentProvider autoPresent={false}>
				<BootstrapProbe />
			</ConsentProvider>
		);

		expect(tree.text()).toBe(
			`rn->9.9.9/${String(FAKE_BOOTSTRAP.protocolVersion)}`
		);

		tree.unmount();
	});
});

describe('protocol version guard', () => {
	test('stops the tree on a native build ahead of this bundle', () => {
		createFakeNativeModule({
			bootstrap: { ...FAKE_BOOTSTRAP, protocolVersion: 99 },
		});

		const message = captureErrorMessage(() =>
			renderToStaticMarkup(
				<ConsentProvider autoPresent={false}>
					<RevisionProbe />
				</ConsentProvider>
			)
		);

		expect(message).toContain('protocol 99');
		expect(message).toContain('Rebuild the app');
	});

	test('stops the tree on a native build behind this bundle', () => {
		createFakeNativeModule({
			bootstrap: { ...FAKE_BOOTSTRAP, protocolVersion: 0 },
		});

		expect(
			captureErrorMessage(() =>
				renderToStaticMarkup(
					<ConsentProvider autoPresent={false}>
						<RevisionProbe />
					</ConsentProvider>
				)
			)
		).toContain('protocol 0');
	});

	test('stops the tree when the native build reports no protocol', () => {
		createFakeNativeModule({ bootstrap: { nativeSdkVersion: 'rn->1.0.0' } });

		expect(
			captureErrorMessage(() =>
				renderToStaticMarkup(
					<ConsentProvider autoPresent={false}>
						<RevisionProbe />
					</ConsentProvider>
				)
			)
		).toContain('no protocolVersion');
	});

	test('stops the tree when the native module is missing', () => {
		// Expo Go, a missing pod, or a web bundle: nothing is registered.
		expect(
			captureErrorMessage(() =>
				renderToStaticMarkup(
					<ConsentProvider autoPresent={false}>
						<RevisionProbe />
					</ConsentProvider>
				)
			)
		).toContain('cannot reach its native consent module');
	});
});

describe('wiring', () => {
	test('a hook outside a provider says what is missing', () => {
		expect(
			captureErrorMessage(() => renderToStaticMarkup(<RevisionProbe />))
		).toContain('<ConsentProvider>');
	});
});

describe('client prop', () => {
	test('publishes the given client and never looks up the native module', () => {
		const fake = createFakeNativeModule({
			snapshot: buildFakeSnapshot({ revision: 41 }),
		});
		const client = createConsentClient(fake, {
			addListener: () => ({ remove: () => undefined }),
		});
		// No module in the registry: a lookup now would throw.
		setNativeModule(NATIVE_INTH_MODULE_NAME);

		const handle = renderTree(
			<ConsentProvider
				autoPresent={false}
				client={client}
			>
				<RevisionProbe />
			</ConsentProvider>
		);

		expect(handle.text()).toBe('r41');
		expect(fake.bootstrapCalls).toBe(1);
		handle.unmount();
		client.dispose();
	});
});
