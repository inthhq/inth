// The package imports the app's config through its own specifier so
// `withConsentManifest` can alias it. Declared here,
// not through `paths`, because the build would rewrite a `paths` import into
// a relative one, which no alias reaches.
declare module '@inth/nextjs/user-config' {
	import type { ConsentConfig } from '~/config';

	const userConfig: ConsentConfig | undefined;
	export default userConfig;
}
