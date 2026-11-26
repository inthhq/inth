import { frontChat } from '../../../vendors/functional/front-chat';
import type { TraceSpec } from '../harness';

export const frontChatTrace: TraceSpec = {
	granted: { functionality: true },
	name: 'front-chat',
	onFileLoad(_src, stubs) {
		stubs.install('FrontChat', stubs.fn('FrontChat'));
	},
	script: () => frontChat({ chatId: 'chat-id' }),
};

export const traces = [frontChatTrace];
