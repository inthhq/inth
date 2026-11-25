/**
 * Leaf predicate for whether consent outcomes are still waiting on policy
 * resolution or an in-flight `userConsent` Promise.
 *
 * Kept free of runtime imports so first-load modules, gates, and framework
 * adapters can share one check without pulling in the kernel.
 *
 * @internal
 */
export const consentPending = function consentPending(snapshot: {
	readonly policyPending: boolean;
	readonly userConsentPending?: boolean;
}): boolean {
	return snapshot.policyPending || snapshot.userConsentPending === true;
};
