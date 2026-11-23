/**
 * The unit project's setup: load the consent UI's on-demand parts before
 * each test file runs. The prompt, its options and the dialog load through
 * `import()`, and the first load of each, transformed and instrumented for
 * coverage, can outlast a test's `vi.waitFor` on a busy machine. Loaded
 * here, a later `import()` resolves from the module cache. The browser
 * project keeps the real on-demand loading.
 */
await Promise.all([
	import('../../ui/prompt/card'),
	import('../../ui/prompt/banner'),
	import('../../ui/prompt/drawer'),
	import('../../ui/prompt/panel'),
	import('../../ui/dialog/dialog'),
	import('../../ui/opt-in-confirmation'),
]);
