import { createConsentKernel } from '@inth/sdk/engine';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { policyRulePresets, resolvePolicyRules } from '@inth/sdk/schema/types';
/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';

import { reactBrowserBudgetsForScenario } from './budgets';
import { evaluateBudget } from './reporting';
import { summarizeMetric } from './utils';

afterEach(() => {
	localStorage.clear();
	// `persistence.clear()` leaves a clear marker cookie behind. Each test
	// measures the cookies its own scenario writes.
	for (const cookie of document.cookie.split('; ')) {
		const [name] = cookie.split('=');
		if (name) {
			document.cookie = `${name}=; Max-Age=0; Path=/`;
		}
	}
	vi.useRealTimers();
});

it('measures the real cookie projections and hydrates without writes', async () => {
	vi.useFakeTimers();
	const resolution = resolvePolicyRules({
		countryCode: 'US',
		regionCode: 'CA',
		rules: [{ ...policyRulePresets.californiaOptOut(), prompt: 'notice' }],
	});
	const kernel = createConsentKernel({ initialPolicyResolution: resolution });
	const persistence = createPersistence({ kernel });
	await kernel.commands.init();
	// A choice made while the notice is owed acknowledges it, so this one
	// save writes the choice and the notice projections together.
	await kernel.commands.save({ functionality: true });
	expect(kernel.getSnapshot().promptRequirement.kind).toBe('none');
	vi.advanceTimersByTime(0);
	const cookies = document.cookie.split('; ').sort();
	// The acknowledgement carries the subject ID in a companion cookie, so
	// the v1 notice cookie keeps its format. The companion repeats the
	// notice fields it is bound to and adds the ID.
	expect(cookies.map((cookie) => cookie.split('=')[0]).sort()).toEqual([
		'inth',
		'inth-notice',
		'inth-notice-subject',
	]);
	const cookieValue = (name: string) =>
		cookies
			.find((cookie) => cookie.startsWith(`${name}=`))
			?.slice(name.length + 1);
	const subjectId = kernel.getSnapshot().subject?.subjectId;
	expect(cookieValue('inth-notice-subject')).toBe(
		`${cookieValue('inth-notice')}&sid=${subjectId}`
	);
	const bytes = Object.fromEntries(
		cookies.map((cookie) => {
			const [name, ...value] = cookie.split('=');
			return [name, new TextEncoder().encode(value.join('=')).length];
		})
	);
	console.log(
		JSON.stringify({
			aggregateCookieHeaderBytes: new TextEncoder().encode(cookies.join('; '))
				.length,
			cookieValueBytes: bytes,
		})
	);
	const budget = reactBrowserBudgetsForScenario('policy-notice').find(
		(entry) => entry.metric === 'inthCookieBytes'
	);
	expect.assert(budget);
	const headerBytes = new TextEncoder().encode(cookies.join('; ')).length;
	expect(
		evaluateBudget(
			budget,
			summarizeMetric('inthCookieBytes', 'bytes', [headerBytes])
		).pass
	).toBe(true);
	expect(
		evaluateBudget(
			budget,
			summarizeMetric('inthCookieBytes', 'bytes', [budget.threshold + 1])
		).pass
	).toBe(false);
	const repeated = createConsentKernel({ initialPolicyResolution: resolution });
	const repeatedPersistence = createPersistence({
		kernel: repeated,
		skipHydration: true,
	});
	const writes = vi.spyOn(Storage.prototype, 'setItem');
	expect(repeatedPersistence.hydrate()).toBe(true);
	vi.advanceTimersByTime(0);
	expect(writes).not.toHaveBeenCalled();
	expect(repeated.getSnapshot().promptRequirement.kind).toBe('none');
	// No opt-out is held, so nothing restricts marketing under the opt-out
	// policy.
	expect(repeated.getSnapshot().effectivePermissions.marketing).toBe(true);
	expect(document.cookie.split('; ').sort()).toEqual(cookies);
	writes.mockRestore();
	repeatedPersistence.dispose();
	repeated.dispose();
	persistence.clear();
	persistence.dispose();
	kernel.dispose();
});

it('adds one cookie for a durable opt-out and hydrates it without writes', async () => {
	vi.useFakeTimers();
	const resolution = resolvePolicyRules({
		countryCode: 'US',
		regionCode: 'CA',
		rules: [{ ...policyRulePresets.californiaOptOut(), prompt: 'notice' }],
	});
	const kernel = createConsentKernel({ initialPolicyResolution: resolution });
	const persistence = createPersistence({ kernel });
	await kernel.commands.init();
	// Under this rule the signal records a durable opt-out. The notice
	// scenario's cookie budget above is measured without one.
	kernel.set.privacySignals({ gpc: true });
	await kernel.commands.save({ functionality: true });
	vi.advanceTimersByTime(0);
	const cookies = document.cookie.split('; ').sort();
	expect(cookies.map((cookie) => cookie.split('=')[0]).sort()).toEqual([
		'inth',
		'inth-notice',
		'inth-notice-subject',
		'inth-opt-out',
	]);
	const optOutCookie = cookies.find((cookie) =>
		cookie.startsWith('inth-opt-out=')
	);
	expect.assert(optOutCookie);
	console.log(
		JSON.stringify({
			aggregateCookieHeaderBytes: new TextEncoder().encode(cookies.join('; '))
				.length,
			optOutCookieBytes: new TextEncoder().encode(optOutCookie).length,
		})
	);
	const repeated = createConsentKernel({ initialPolicyResolution: resolution });
	const repeatedPersistence = createPersistence({
		kernel: repeated,
		skipHydration: true,
	});
	const writes = vi.spyOn(Storage.prototype, 'setItem');
	expect(repeatedPersistence.hydrate()).toBe(true);
	vi.advanceTimersByTime(0);
	expect(writes).not.toHaveBeenCalled();
	// The fresh runtime has no signal. The opt-out it recorded is durable, so
	// marketing stays off.
	expect(repeated.getSnapshot().optOut?.method).toBe('gpc');
	expect(repeated.getSnapshot().effectivePermissions.marketing).toBe(false);
	expect(document.cookie.split('; ').sort()).toEqual(cookies);
	writes.mockRestore();
	repeatedPersistence.dispose();
	repeated.dispose();
	persistence.clear();
	persistence.dispose();
	kernel.dispose();
});
