/**
 * Per-request block evaluation.
 *
 * Pure: takes a parsed URL, the method, the current rules list, the
 * current snapshot and the matcher and consent evaluator, and returns whether to block
 * the request.
 * Walks the rules in order and returns on the first match whose
 * consent condition is denied.
 */
import type { ConsentSnapshot } from '../../consent-kernel.model';
import type {
	BlockDecision,
	NetworkBlockerRule,
	NetworkBlockerTools,
} from './network-blocker.model';

/**
 * Evaluate a request against the rules list. Returns the first matching
 * rule whose consent condition is denied; otherwise `{ shouldBlock: false }`.
 */
export const evaluateBlock = function evaluateBlock(
	url: URL,
	method: string,
	rules: NetworkBlockerRule[],
	snapshot: ConsentSnapshot,
	tools: Pick<NetworkBlockerTools, 'evaluate' | 'ruleMatches'>
): BlockDecision {
	for (const rule of rules) {
		if (
			tools.ruleMatches(rule, url, method) &&
			!tools.evaluate(rule, snapshot)
		) {
			return { rule, shouldBlock: true };
		}
	}
	return { shouldBlock: false };
};
