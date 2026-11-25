// The part of Vite's `import.meta.env` that `cross-domain-app.tsx` reads. A
// Vite app gets the full type from `vite/client`.
interface ImportMeta {
	readonly env: { readonly VITE_INTH_PROJECT_URL: string };
}
