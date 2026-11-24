import { beforeAll } from 'vite-plus/test';

// Imported here rather than at the top, so a test file's `vi.mock` calls
// are registered before `../root` and its config load.
beforeAll(async () => {
	const { preloadRoot } = await import('../root');
	await preloadRoot();
});
