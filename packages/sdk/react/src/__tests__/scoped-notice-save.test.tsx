import type { ConsentKernel } from '@inth/sdk/engine';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import { useContext, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { test, expect, vi } from 'vitest';

import { ConsentDialog } from '../aggregate-components';
import { KernelContext } from '../context';
import { InthProvider } from '../provider';

// The dialog under a US notice shows the rights rows and Done, not the
// one-click pair, and its Save stays disabled until a switch changes
// (EU-03); `consent-dialog-body.test.tsx` covers both. The scenario stays in the type so
// the shared assertions below read the same.
for (const scenario of ['scoped', 'necessary-only'] as (
	| 'notice'
	| 'scoped'
	| 'necessary-only'
)[]) {
	for (const action of ['accept', 'reject'] as const) {
		test(`${scenario} actual React ${action} saves displayed scope and respects the remaining prompt`, async () => {
			const pending = Promise.withResolvers<{ ok: boolean }>();
			const save = vi.fn(() => pending.promise);
			const resolution = resolvePolicyRules({
				countryCode: null,
				regionCode: null,
				rules: [
					{
						categories:
							scenario === 'necessary-only'
								? ['necessary']
								: ['marketing', 'measurement'],
						id: scenario,
						match: { isDefault: true },
						model: scenario === 'notice' ? 'opt-out' : 'opt-in',
						prompt: scenario === 'notice' ? 'notice' : 'choice',
						scopeMode: 'permissive',
					},
				],
			});
			let kernel!: ConsentKernel;
			const Capture = () => {
				const current = useContext(KernelContext);
				if (!current) {
					throw new Error('kernel absent');
				}
				useEffect(() => {
					kernel = current;
					kernel.set.activeUI('dialog');
				}, [current]);
				return null;
			};
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			root.render(
				<InthProvider
					options={{
						consentCategories:
							scenario === 'notice'
								? ['marketing', 'measurement']
								: ['necessary', 'measurement'],
						enabled: true,
						mode: Object.assign(() => ({ save }), { kind: 'custom' as const }),
						persistence: false,
						prefetch: { initialPolicyResolution: resolution },
					}}
				>
					<Capture />
					<ConsentDialog disableAnimation />
				</InthProvider>
			);
			try {
				await vi.waitFor(() =>
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).not.toBeNull()
				);
				expect(kernel.getSnapshot().resolution.status).toBe('matched');
				expect(kernel.getSnapshot().policyRule.id).toBe(scenario);
				/* oxlint-disable vitest/no-conditional-expect -- These assertions apply to the explicitly declared scoped-policy scenario. */
				if (scenario !== 'notice') {
					expect(
						document.querySelector(
							'[data-testid="consent-dialog-category-switch-marketing"]'
						)
					).toBeNull();
					expect(
						document.querySelector(
							'[data-testid="consent-dialog-category-switch-measurement"]'
						)
					).not.toBeNull();
				}
				/* oxlint-enable vitest/no-conditional-expect */
				const id = {
					accept: 'consent-dialog-accept-all',
					reject: 'consent-dialog-reject-all',
				}[action];
				const button = document.querySelector<HTMLButtonElement>(
					`[data-testid="${id}"]`
				);
				expect(button).not.toBeNull();
				button?.click();
				// The dialog leaves in the click task, before the request is
				// sent. A choice under a notice acknowledges the notice in the
				// same commit, so no banner is left behind in either scenario.
				expect(kernel.getSnapshot().activeUI).toBe('none');
				expect(save).not.toHaveBeenCalled();
				await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
				expect(kernel.getSnapshot().explicitChoice).not.toBeNull();
				/* oxlint-disable vitest/no-conditional-expect -- These assertions apply to the explicitly declared scoped-policy scenario. */
				if (scenario !== 'notice') {
					expect(
						kernel.getSnapshot().explicitChoice?.categories.marketing
					).toBeUndefined();
					expect(
						kernel.getSnapshot().explicitChoice?.categories.measurement?.value
					).toBe(action === 'accept');
				}
				/* oxlint-enable vitest/no-conditional-expect */
				pending.resolve({ ok: true });
				// Completing the displayed choice leaves nothing owed under a
				// scoped rule, and the notice was acknowledged by the save.
				await vi.waitFor(() =>
					expect(kernel.getSnapshot().activeUI).toBe('none')
				);
				expect(kernel.getSnapshot().promptRequirement.kind).toBe('none');
				/* oxlint-disable vitest/no-conditional-expect -- These assertions apply to the explicitly declared scoped-policy scenario. */
				if (scenario !== 'notice') {
					// Hidden marketing remains denied after completing the displayed choice.
					expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(
						false
					);
				}
				/* oxlint-enable vitest/no-conditional-expect */
				expect(
					document.querySelector('[data-testid="consent-dialog-root"]')
				).toBeNull();
			} finally {
				pending.resolve({ ok: false });
				root.unmount();
				container.remove();
			}
		});
	}
}
