import type { TraceScenario } from './harness';

/** Scenarios every vendor runs, in fixture order. */
export const standardScenarios: readonly TraceScenario[] = [
	{
		name: 'denied, grant, load, revoke, regrant, dispose',
		start: 'denied',
		steps: ['grant', 'load', 'deny', 'grant', 'load', 'dispose'],
	},
	{
		name: 'granted, load, dispose',
		start: 'granted',
		steps: ['load', 'dispose'],
	},
	{
		name: 'replace with identical options while granted',
		start: 'granted',
		steps: ['load', 'replace', 'load', 'dispose'],
	},
	{
		name: 'replace while a revoke is pending',
		start: 'granted',
		steps: ['load', 'replace-while-revoke-pending', 'grant', 'load', 'dispose'],
	},
	{
		name: 'load after the element was removed',
		start: 'granted',
		steps: ['remove-element', 'load-detached', 'dispose'],
	},
	{
		name: 'grant then revoke in the same tick',
		start: 'denied',
		steps: ['grant-then-deny', 'load-detached', 'grant', 'load', 'dispose'],
	},
];
