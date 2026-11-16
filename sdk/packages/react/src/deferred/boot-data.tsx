'use client';

/**
 * Server side of {@link ConsentBoot}: renders the snapshots into the HTML.
 * Loaded with the engine, never in the first-load chunk.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@c15t/core';
import type { RuntimePrefetch, StreamedPrefetch } from '@c15t/core/runtime';
import * as React from 'react';
import { useContext } from 'react';

import { StreamedPrefetchContext } from '../context';
import { useKernel } from '../kernel-selector';
import { useUIConfig } from '../ui-config-context';
import { CONSENT_BOOT_ATTRIBUTE, canDeferEngine } from './boot';
import type { ConsentBoot } from './boot';
import { enginePreloadScript } from './engine-preload-script';

type RecordedThenable<Value> = PromiseLike<Value> & {
	status?: 'pending' | 'fulfilled';
	value?: Value;
};

/** `use()` where React has it (19); React 18 throws and reads it on retry. */
const useSettled = function useSettled<Value>(
	thenable: PromiseLike<Value>
): Value {
	const { use } = React as { use?: <Read>(usable: PromiseLike<Read>) => Read };
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `use` keeps its own rules.
		return use(thenable);
	}
	const recorded = thenable as RecordedThenable<Value>;
	if (recorded.status === 'fulfilled') {
		return recorded.value as Value;
	}
	throw thenable;
};

/** Props of {@link ConsentBootData}. @internal */
export interface ConsentBootDataProps {
	/**
	 * The server render's id, which its inline scripts wrote their page
	 * object under (`newRenderId` in `@c15t/core/runtime/script-server-start`).
	 * The browser reads that object only for the boot data with this id.
	 */
	renderId?: string;
	/**
	 * The path every bundler chunk URL contains, such as Next.js's
	 * `/_next/static/`, as the browser side gives to `learnEngineChunks`.
	 * Without it the server leaves no engine preload: an adapter whose
	 * bundler loads chunks without `<script>` elements (Vite's native
	 * `import()`) has nothing to learn.
	 */
	chunks?: string;
	/**
	 * Preload the engine whatever the snapshot says: the root's options
	 * need it from the first render (see `rootNeedsEngine`), so the
	 * browser renders the root eagerly.
	 */
	preload?: boolean;
}

/** `boot`, with the render's id when the server gave one. */
const withRenderId = (boot: ConsentBoot, renderId?: string): ConsentBoot => {
	if (renderId !== undefined) {
		boot.i = renderId;
	}
	return boot;
};

const BootJSON = ({
	boot,
	chunks,
	preload = false,
}: ConsentBootDataProps & { boot: ConsentBoot }) => {
	const { nonce } = useUIConfig();
	return (
		<>
			<script
				{...{ [CONSENT_BOOT_ATTRIBUTE]: '' }}
				// oxlint-disable-next-line react/no-danger -- Escaped JSON, read with JSON.parse.
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(boot).replace(/</gu, '\\u003c'),
				}}
				type="application/json"
			/>
			{/* A visitor the engine must serve at once: start its chunks
			now, not when the shell's chunk runs. Always rendered, empty
			otherwise, so the browser renders the same elements. */}
			<script
				// oxlint-disable-next-line react/no-danger -- c15t's own constant script.
				dangerouslySetInnerHTML={{
					__html:
						chunks === undefined ||
						(!preload && canDeferEngine(boot.r ?? boot.s))
							? ''
							: enginePreloadScript(chunks),
				}}
				nonce={nonce}
			/>
		</>
	);
};

/** With a streamed state: waits for it, as the streamed surfaces do. */
const StreamedBootData = ({
	chunks,
	preload,
	renderId,
	server,
	streamed,
}: ConsentBootDataProps & {
	server: ConsentSnapshot;
	streamed: StreamedPrefetch;
}) => {
	const config = useSettled<RuntimePrefetch | undefined>(streamed.settled);
	const resolved = streamed.snapshotFor(config);
	return (
		<BootJSON
			boot={withRenderId(
				resolved === server ? { s: server } : { r: resolved, s: server },
				renderId
			)}
			chunks={chunks}
			preload={preload}
		/>
	);
};

/**
 * The server render of {@link ConsentBootData}. Exported for tests that
 * render the server tree in a browser.
 *
 * @internal
 */
export const ServerBootData = ({
	chunks,
	preload,
	renderId,
}: ConsentBootDataProps) => {
	const kernel = useKernel();
	const streamed = useContext(StreamedPrefetchContext);
	const server = kernel.getServerSnapshot();
	return streamed ? (
		<StreamedBootData
			chunks={chunks}
			preload={preload}
			renderId={renderId}
			server={server}
			streamed={streamed}
		/>
	) : (
		<BootJSON
			boot={withRenderId({ s: server }, renderId)}
			chunks={chunks}
			preload={preload}
		/>
	);
};

/**
 * The snapshots a deferred root reads before its engine loads. Render it
 * inside the provider, in a Suspense boundary: with a streamed state it
 * waits for the state. In the browser it keeps the server's element.
 *
 * @param props - The bundler's chunk path, and whether to preload the
 * engine whatever the snapshot says.
 * @internal
 */
export const ConsentBootData = (props: ConsentBootDataProps) => {
	if (typeof document !== 'undefined') {
		return (
			<>
				<script
					{...{ [CONSENT_BOOT_ATTRIBUTE]: '' }}
					// oxlint-disable-next-line react/no-danger -- Empty: keeps the server's element.
					dangerouslySetInnerHTML={{ __html: '' }}
					suppressHydrationWarning
					type="application/json"
				/>
				<script
					// oxlint-disable-next-line react/no-danger -- Empty: keeps the server's script.
					dangerouslySetInnerHTML={{ __html: '' }}
					suppressHydrationWarning
				/>
			</>
		);
	}
	return (
		<ServerBootData
			chunks={props.chunks}
			preload={props.preload}
			renderId={props.renderId}
		/>
	);
};
