import ConsentDevTools from './components/consent-dev-tools.svelte';

/** Compatible short name for {@link ConsentDevTools}. */
const DevTools = ConsentDevTools;

/** Another name for {@link ConsentDevTools}. */
const InthDevTools = ConsentDevTools;

export { InthDevTools, ConsentDevTools, DevTools };
export default ConsentDevTools;

export type {
	DevToolsInstance,
	DevToolsOptions,
	DevToolsPosition,
	DevToolsTab,
} from '@inth/sdk/devtools';
export type {
	InthDevToolsProps,
	ConsentDevToolsProps,
	DevToolsProps,
} from './devtools-options.model';
