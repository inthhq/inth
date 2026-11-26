import { fullStory } from '../../../vendors/analytics/fullstory';
import type { FullStoryApi } from '../../../vendors/analytics/fullstory';
import type { TraceSpec, TraceStubs } from '../harness';

// fs.js attaches its dispatcher as `FS._api` and drains the queue, as the
// lifecycle suite's runtime does.
const runFile = (_src: string, stubs: TraceStubs) => {
	const api = stubs.win.FS as FullStoryApi | undefined;
	if (!api) {
		stubs.note({ note: 'fs.js found no FS' });
		return;
	}
	const dispatch = stubs.fn('FS._api');
	api._api = dispatch;
	for (const call of api.q ?? []) {
		dispatch(...call);
	}
	api.q = [];
};

export const fullStoryTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'fullstory',
	onFileLoad: runFile,
	script: () => fullStory({ elementConsent: true, orgId: 'o-TRACE-na1' }),
};

export const traces = [fullStoryTrace];
