// The part of Vite's `import.meta.env` that `ConsentDevTools.vue` and
// `cross-domain-main.ts` read. A Vite app gets the full type from
// `vite/client`.
interface ImportMeta {
	readonly env: {
		readonly DEV: boolean;
		readonly VITE_INTH_PROJECT_URL: string;
	};
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
