// The part of Vite's `import.meta.env` that `ConsentDevTools.vue` reads. A
// Vite app gets the full type from `vite/client`.
interface ImportMeta {
	readonly env: { readonly DEV: boolean };
}

declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<
		Record<string, unknown>,
		Record<string, unknown>,
		unknown
	>;
	export default component;
}
