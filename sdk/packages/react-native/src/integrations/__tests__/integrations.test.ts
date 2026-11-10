import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot } from '../../protocol';
import { connectFirebaseAnalytics, connectPostHog } from '../index';

const snapshot = (revision: number, measurement: boolean): ConsentSnapshot => {
	const initial = buildSnapshot();
	return buildSnapshot({
		effectivePermissions: { ...initial.effectivePermissions, measurement },
		revision,
	});
};

const firebase = () => ({
	setAnalyticsCollectionEnabled: vi.fn((_enabled: boolean) =>
		Promise.resolve()
	),
	setConsent: vi.fn((_consent: unknown) => Promise.resolve()),
});

const deferred = () => {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
};

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
});

describe('Firebase Analytics', () => {
	test('denies pending consent, including all advertising permissions', async () => {
		createFakeNativeModule({
			snapshot: buildSnapshot({ policyPending: true, ready: false }),
		});
		const analytics = firebase();
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		await integration.ready;
		expect(analytics.setAnalyticsCollectionEnabled.mock.calls).toEqual([
			[false],
		]);
		expect(analytics.setConsent).toHaveBeenCalledWith({
			ad_personalization: false,
			ad_storage: false,
			ad_user_data: false,
			analytics_storage: false,
		});
		await integration.disconnect();
	});

	test('applies restored permission and handles withdrawal in order', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const calls: unknown[] = [];
		const integration = connectFirebaseAnalytics(
			{
				setAnalyticsCollectionEnabled: (enabled) => {
					calls.push(enabled);
				},
				setConsent: (settings) => {
					calls.push(settings.analytics_storage);
				},
			},
			{ onError: vi.fn() }
		);
		await integration.ready;
		expect(calls).toEqual([false, true, true]);
		fake.pushSnapshot(snapshot(1, false));
		await integration.disconnect();
		expect(calls).toEqual([false, true, true, false, false]);
	});

	test('rechecks native permission while Firebase consent is in flight', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const wait = deferred();
		const analytics = firebase();
		analytics.setConsent.mockImplementationOnce(() => wait.promise);
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		await vi.waitFor(() => expect(analytics.setConsent).toHaveBeenCalledOnce());
		fake.pushSnapshot(snapshot(1, false));
		wait.release();
		await integration.ready;
		await integration.disconnect();
		expect(analytics.setAnalyticsCollectionEnabled).not.toHaveBeenCalledWith(
			true
		);
		expect(analytics.setConsent).toHaveBeenLastCalledWith({
			ad_personalization: false,
			ad_storage: false,
			ad_user_data: false,
			analytics_storage: false,
		});
	});

	test('finishes a compensating refusal before ready when collection is enabled during withdrawal', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const enabling = deferred();
		const disabling = deferred();
		let collecting = false;
		let ready = false;
		const analytics = firebase();
		analytics.setAnalyticsCollectionEnabled.mockImplementation(
			async (enabled) => {
				if (enabled) {
					await enabling.promise;
					collecting = true;
				} else if (collecting) {
					await disabling.promise;
					collecting = false;
				}
			}
		);
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		void integration.ready.then(() => {
			ready = true;
		});
		try {
			await vi.waitFor(() =>
				expect(analytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
					true
				)
			);
			fake.pushSnapshot(snapshot(1, false));
			enabling.release();
			await vi.waitFor(() =>
				expect(analytics.setAnalyticsCollectionEnabled.mock.calls).toEqual([
					[false],
					[true],
					[false],
				])
			);
			expect(ready).toBe(false);
			disabling.release();
			await integration.ready;
			expect(collecting).toBe(false);
			expect(analytics.setConsent).toHaveBeenLastCalledWith({
				ad_personalization: false,
				ad_storage: false,
				ad_user_data: false,
				analytics_storage: false,
			});
		} finally {
			enabling.release();
			disabling.release();
			await integration.disconnect();
		}
	});

	test('surfaces a failed consent update and retries without granting collection', async () => {
		createFakeNativeModule({ snapshot: snapshot(0, true) });
		const analytics = firebase();
		const failure = new Error('Firebase unavailable');
		analytics.setConsent.mockRejectedValueOnce(failure);
		const onError = vi.fn();
		const integration = connectFirebaseAnalytics(analytics, { onError });
		await expect(integration.ready).rejects.toBe(failure);
		expect(onError).toHaveBeenCalledWith(failure);
		expect(analytics.setAnalyticsCollectionEnabled).not.toHaveBeenCalledWith(
			true
		);
		await integration.sync();
		expect(analytics.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(
			true
		);
		await integration.disconnect();
	});

	test('ignores unrelated snapshots and reapplies after an explicit vendor reset', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const analytics = firebase();
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		await integration.ready;
		fake.pushSnapshot(snapshot(1, true));
		await Promise.resolve();
		expect(analytics.setConsent).toHaveBeenCalledOnce();
		await integration.sync();
		expect(analytics.setConsent).toHaveBeenCalledTimes(2);
		await integration.disconnect();
	});

	test('grants advertising from marketing, as the web does', async () => {
		const initial = snapshot(0, true);
		createFakeNativeModule({
			snapshot: {
				...initial,
				effectivePermissions: {
					...initial.effectivePermissions,
					marketing: true,
				},
			},
		});
		const analytics = firebase();
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		await integration.ready;
		expect(analytics.setConsent).toHaveBeenCalledWith({
			ad_personalization: true,
			ad_storage: true,
			ad_user_data: true,
			analytics_storage: true,
		});
		await integration.disconnect();
		expect(analytics.setConsent).toHaveBeenLastCalledWith({
			ad_personalization: false,
			ad_storage: false,
			ad_user_data: false,
			analytics_storage: false,
		});
	});

	test('follows marketing alone without enabling collection', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, false) });
		const analytics = firebase();
		const integration = connectFirebaseAnalytics(analytics, {
			onError: vi.fn(),
		});
		await integration.ready;
		const marketing = (revision: number, allowed: boolean) => {
			const next = snapshot(revision, false);
			return {
				...next,
				effectivePermissions: {
					...next.effectivePermissions,
					marketing: allowed,
				},
			};
		};
		fake.pushSnapshot(marketing(1, true));
		await vi.waitFor(() =>
			expect(analytics.setConsent).toHaveBeenLastCalledWith({
				ad_personalization: true,
				ad_storage: true,
				ad_user_data: true,
				analytics_storage: false,
			})
		);
		fake.pushSnapshot(marketing(2, false));
		await vi.waitFor(() =>
			expect(analytics.setConsent).toHaveBeenLastCalledWith({
				ad_personalization: false,
				ad_storage: false,
				ad_user_data: false,
				analytics_storage: false,
			})
		);
		expect(analytics.setConsent).toHaveBeenCalledTimes(3);
		expect(analytics.setAnalyticsCollectionEnabled).not.toHaveBeenCalledWith(
			true
		);
		await integration.disconnect();
	});
});

describe('PostHog', () => {
	test.each(['throws', 'rejects'] as const)(
		'contains an error reporter that %s and preserves the vendor rejection and withdrawal',
		async (behavior) => {
			const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
			const vendorFailure = new Error('Vendor rejected grant');
			const reporterFailure = new Error('Reporter unavailable');
			const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				const posthog = {
					optIn: vi.fn(() => Promise.reject(vendorFailure)),
					optOut: vi.fn(() => Promise.resolve()),
				};
				const integration = connectPostHog(posthog, {
					onError: () => {
						if (behavior === 'rejects') {
							return Promise.reject(reporterFailure);
						}
						throw reporterFailure;
					},
				});
				await expect(integration.ready).rejects.toBe(vendorFailure);
				await vi.waitFor(() =>
					expect(errorLog).toHaveBeenCalledWith(
						'[c15t] Analytics integration error reporter failed.',
						reporterFailure
					)
				);
				fake.pushSnapshot(snapshot(1, false));
				await vi.waitFor(() => expect(posthog.optOut).toHaveBeenCalledOnce());
				await integration.disconnect();
			} finally {
				errorLog.mockRestore();
			}
		}
	);

	test('retries a failed teardown without reconnecting its subscription', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const failure = new Error('PostHog rejected opt-out');
		const onError = vi.fn();
		const posthog = {
			optIn: vi.fn(),
			optOut: vi.fn(() => Promise.resolve()),
		};
		const integration = connectPostHog(posthog, { onError });
		await integration.ready;
		posthog.optOut.mockRejectedValueOnce(failure);
		await expect(integration.disconnect()).rejects.toBe(failure);
		expect(onError).toHaveBeenCalledWith(failure);
		await integration.disconnect();
		fake.pushSnapshot(snapshot(1, false));
		fake.pushSnapshot(snapshot(2, true));
		await Promise.resolve();
		expect(posthog.optOut).toHaveBeenCalledTimes(2);
		expect(posthog.optIn).toHaveBeenCalledOnce();
	});

	test('disconnect overrides an independent SDK reset while consent remains denied', async () => {
		createFakeNativeModule();
		const posthog = {
			allowed: true,
			optIn() {
				this.allowed = true;
			},
			optOut() {
				this.allowed = false;
			},
		};
		const integration = connectPostHog(posthog, { onError: vi.fn() });
		await integration.ready;
		expect(posthog.allowed).toBe(false);
		posthog.allowed = true;
		await integration.disconnect();
		expect(posthog.allowed).toBe(false);
		await integration.sync();
		expect(posthog.allowed).toBe(false);
	});

	test('unreadable native authority disables an already active vendor', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const posthog = { optIn: vi.fn(), optOut: vi.fn() };
		const integration = connectPostHog(posthog, { onError: vi.fn() });
		await integration.ready;
		fake.pushUnreadableSnapshot('{broken');
		await vi.waitFor(() => expect(posthog.optOut).toHaveBeenCalledOnce());
		await integration.disconnect();
	});

	test('one vendor failure does not block another vendor receiving withdrawal', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const analytics = firebase();
		const onError = vi.fn();
		const firebaseIntegration = connectFirebaseAnalytics(analytics, {
			onError,
		});
		const posthog = { optIn: vi.fn(), optOut: vi.fn() };
		const posthogIntegration = connectPostHog(posthog, { onError });
		await Promise.all([firebaseIntegration.ready, posthogIntegration.ready]);
		const failure = new Error('Firebase rejected disable');
		analytics.setAnalyticsCollectionEnabled.mockRejectedValueOnce(failure);
		fake.pushSnapshot(snapshot(1, false));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
		expect(posthog.optOut).toHaveBeenCalledOnce();
		await Promise.all([
			firebaseIntegration.disconnect(),
			posthogIntegration.disconnect(),
		]);
	});

	test('keeps capture off before permission and handles grant and withdrawal', async () => {
		const fake = createFakeNativeModule();
		const posthog = { optIn: vi.fn(), optOut: vi.fn() };
		const integration = connectPostHog(posthog, { onError: vi.fn() });
		await integration.ready;
		expect(posthog.optOut).toHaveBeenCalledOnce();
		fake.pushSnapshot(snapshot(1, true));
		await vi.waitFor(() => expect(posthog.optIn).toHaveBeenCalledOnce());
		fake.pushSnapshot(snapshot(2, false));
		await integration.disconnect();
		expect(posthog.optOut).toHaveBeenCalledTimes(2);
	});

	test('finishes an async opt-out after an in-flight grant is withdrawn', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const wait = deferred();
		const posthog = {
			optIn: vi.fn(() => wait.promise),
			optOut: vi.fn(() => Promise.resolve()),
		};
		const integration = connectPostHog(posthog, { onError: vi.fn() });
		await vi.waitFor(() => expect(posthog.optIn).toHaveBeenCalledOnce());
		fake.pushSnapshot(snapshot(1, false));
		wait.release();
		await integration.ready;
		expect(posthog.optOut).toHaveBeenCalledOnce();
		await integration.disconnect();
		expect(posthog.optOut).toHaveBeenCalledTimes(2);
	});

	test('disconnects during an in-flight grant and never re-enables', async () => {
		const fake = createFakeNativeModule({ snapshot: snapshot(0, true) });
		const wait = deferred();
		const posthog = { optIn: vi.fn(() => wait.promise), optOut: vi.fn() };
		const integration = connectPostHog(posthog, { onError: vi.fn() });
		await vi.waitFor(() => expect(posthog.optIn).toHaveBeenCalledOnce());
		const stop = integration.disconnect();
		expect(integration.disconnect()).toBe(stop);
		wait.release();
		await stop;
		fake.pushSnapshot(snapshot(1, false));
		fake.pushSnapshot(snapshot(2, true));
		await Promise.resolve();
		expect(posthog.optIn).toHaveBeenCalledOnce();
		expect(posthog.optOut).toHaveBeenCalledOnce();
	});

	test('reports later failures and allows the next denial to proceed', async () => {
		const fake = createFakeNativeModule();
		const failure = new Error('PostHog unavailable');
		const onError = vi.fn();
		const posthog = {
			optIn: vi.fn(() => Promise.reject(failure)),
			optOut: vi.fn(() => Promise.resolve()),
		};
		const integration = connectPostHog(posthog, { onError });
		await integration.ready;
		fake.pushSnapshot(snapshot(1, true));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
		fake.pushSnapshot(snapshot(2, false));
		await integration.disconnect();
		expect(posthog.optOut).toHaveBeenCalledTimes(2);
	});

	test('uses the selected category and preserves method receivers', async () => {
		createFakeNativeModule();
		const posthog = {
			allowed: false,
			optIn() {
				this.allowed = true;
			},
			optOut() {
				this.allowed = false;
			},
		};
		const integration = connectPostHog(posthog, {
			category: 'functionality',
			onError: vi.fn(),
		});
		await integration.ready;
		expect(posthog.allowed).toBe(true);
		await integration.disconnect();
		expect(posthog.allowed).toBe(false);
	});
});
