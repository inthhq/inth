import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '../../fixture';

export default defineEventHandler(async (event) => {
	recordBenchConsentFixtureExecution('subjects');
	await applyBenchConsentLatency();
	const body = await readBody<{ subjectId?: string }>(event);
	setHeader(event, 'cache-control', 'no-store');
	return {
		recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
		subjectId: body.subjectId,
	};
});
