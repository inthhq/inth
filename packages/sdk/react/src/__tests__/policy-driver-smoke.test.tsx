import type { TestDriver } from '@inth/conformance/driver';
import {
	POLICY_CHOICE,
	POLICY_SCENARIOS,
} from '@inth/conformance/fixtures/policy-scenarios';
import { executePolicyScenario } from '@inth/conformance/suite';
import { describe, expect, it } from 'vite-plus/test';

import { createPolicySession } from './policy-driver';

it('observes real gate transitions and separate callback records', async () => {
	const clock = Date.now();
	const session = await createPolicySession({
		clock: { now: () => clock },
		gpc: false,
		policy: POLICY_CHOICE,
		probeGates: true,
		storage: {},
	});
	try {
		await session.execute({ kind: 'hydrate' });
		let evidence = await session.observe();
		expect(evidence.gates?.scriptAttached).toBe(false);
		expect(evidence.gates?.networkCompletions).toBe(0);
		expect(evidence.gates?.consentMode.ad_storage).toBe('denied');
		await session.execute({ kind: 'accept' });
		evidence = await session.observe();
		expect(evidence.gates?.scriptAttached).toBe(true);
		expect(evidence.gates?.scriptLoads).toBe(1);
		expect(evidence.gates?.networkCompletions).toBe(1);
		expect(evidence.gates?.iframeSrc).toContain('inth-policy-probe');
		expect(evidence.gates?.consentMode.ad_storage).toBe('granted');
		expect(
			evidence.logs.callbacks.filter(
				(event) => event.name === 'onChoiceRecorded'
			)
		).toHaveLength(1);
	} finally {
		await session.dispose();
	}
});

it('reports hidden ancestors in actual server and client prompt evidence', async () => {
	const clock = Date.now();
	const session = await createPolicySession({
		clock: { now: () => clock },
		gpc: false,
		policy: POLICY_CHOICE,
		probeGates: false,
		storage: {},
	});
	const { opacity } = document.body.style;
	try {
		document.body.style.opacity = '0';
		await session.execute({ kind: 'ssr-hydrate' });
		const evidence = await session.observe();
		expect(evidence.ssr?.server.prompt.kind).toBe('choice');
		expect(evidence.ssr?.server.now).toBe(clock);
		expect(evidence.ssr?.server.firstLayer).toBe('hidden');
		expect(evidence.ssr?.client.firstLayer).toBe('hidden');
		expect(evidence.dom.actions.every((action) => !action.visible)).toBe(true);
		document.body.style.opacity = opacity;
		expect((await session.observe()).dom.firstLayer).toBe('choice');
		await session.execute({ kind: 'accept' });
		const after = await session.observe();
		expect(after.snapshot.promptRequirement.kind).toBe('none');
		expect(after.ssr?.server.prompt.kind).toBe('choice');
	} finally {
		document.body.style.opacity = opacity;
		await session.dispose();
	}
});

it('uses a newly mounted provider after repeated reloads', async () => {
	const now = Date.now();
	const session = await createPolicySession({
		clock: { now: () => now },
		gpc: false,
		policy: POLICY_CHOICE,
		probeGates: false,
		storage: {},
	});
	try {
		await session.execute({ kind: 'hydrate' });
		await session.execute({ kind: 'accept' });
		await session.execute({ kind: 'reload' });
		expect(
			(await session.observe()).snapshot.effectivePermissions.marketing
		).toBe(true);
		await session.execute({ kind: 'save', values: { marketing: false } });
		await session.execute({ kind: 'reload' });
		expect(
			(await session.observe()).snapshot.effectivePermissions.marketing
		).toBe(false);
	} finally {
		await session.dispose();
	}
});

/**
 * The notice scenario presses Done in the dialog. A broken Done must fail
 * it: the header Close is not allowed to stand in.
 */
describe('a broken Done fails the notice scenario', () => {
	const DONE = '[data-testid="consent-dialog-done"]';
	const found = POLICY_SCENARIOS.find(
		(candidate) => candidate.id === 'gpc-legacy-anonymous-grant'
	);
	if (!found) {
		throw new Error('Missing the gpc-legacy-anonymous-grant scenario');
	}
	const scenario = found;
	const unused = () =>
		Promise.reject(new Error('Not used by policy scenarios'));
	/** The real driver, with `breakDone` applied around each save-current. */
	const brokenDriver = (breakDone: () => () => void): TestDriver => ({
		createPolicySession: async (setup) => {
			const session = await createPolicySession(setup);
			return {
				...session,
				async execute(operation) {
					if (operation.kind !== 'save-current') {
						await session.execute(operation);
						return;
					}
					const restore = breakDone();
					try {
						await session.execute(operation);
					} finally {
						restore();
					}
				},
			};
		},
		framework: 'react',
		getStore: () => {
			throw new Error('Not used by policy scenarios');
		},
		mount: unused,
		serverRender: unused,
	});
	const api = { describe, expect, test: it };

	it('uses Done, so the scenario passes with it working', async () => {
		expect(scenario.steps.map((step) => step.operation)).toContainEqual({
			close: 'done',
			kind: 'save-current',
		});
		await executePolicyScenario(
			brokenDriver(() => () => undefined),
			api,
			scenario
		);
	});

	it('fails when Done is missing or disabled, though Close still works', async () => {
		const run = executePolicyScenario(
			brokenDriver(() => {
				const disable = () => {
					for (const done of document.querySelectorAll<HTMLButtonElement>(
						DONE
					)) {
						done.disabled = true;
					}
				};
				disable();
				const observer = new MutationObserver(disable);
				observer.observe(document.body, { childList: true, subtree: true });
				return () => observer.disconnect();
			}),
			api,
			scenario
		);
		await expect(run).rejects.toThrow(/save-current/u);
		await expect(run).rejects.toHaveProperty(
			'cause.message',
			expect.stringContaining('consent-dialog-done')
		);
	});

	it('fails when Done does nothing', async () => {
		const run = executePolicyScenario(
			brokenDriver(() => {
				const swallow = (event: MouseEvent) => {
					if ((event.target as Element | null)?.closest?.(DONE)) {
						event.stopImmediatePropagation();
						event.preventDefault();
					}
				};
				window.addEventListener('click', swallow, true);
				return () => window.removeEventListener('click', swallow, true);
			}),
			api,
			scenario
		);
		await expect(run).rejects.toThrow(/save-current/u);
	});
});
