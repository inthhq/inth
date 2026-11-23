'use client';

/**
 * Server side of {@link ConsentBoot}: renders the snapshots into the HTML.
 * Loaded with the engine, never in the first-load chunk.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { RuntimePrefetch, StreamedPrefetch } from '@inth/sdk/runtime';
import * as React from 'react';
import { useContext } from 'react';

import { StreamedPrefetchContext } from '../context';
import { useKernel } from '../use-kernel';
import { useUIConfig } from '../use-ui-config';
import {
	CONSENT_BOOT_ATTRIBUTE,
	awaitsChoice,
	canDeferEngineAfterChoice,
} from './boot';
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
	 * object under (`newRenderId` in `@inth/sdk/runtime/script-server-start`).
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
	/**
	 * The server's stored-choice check (`storedChoiceCheckScript`), which
	 * core leaves out for a root that needs the engine at once. Placed
	 * before the preload, which reads its result, for a visitor whose
	 * engine may wait. Server only.
	 */
	storedChoiceCheck?: string;
	/**
	 * The root defers a returning visitor's engine on the stored-choice
	 * check (`storedChoiceCheck`): renders the slot that check goes in.
	 * Pass it on the server and in the browser alike. Without it the boot
	 * data renders as it did before that mode.
	 */
	storedChoice?: boolean;
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
	storedChoice = false,
	storedChoiceCheck,
}: ConsentBootDataProps & { boot: ConsentBoot }) => {
	const { nonce } = useUIConfig();
	const snapshot = boot.r ?? boot.s;
	// A returning visitor whose engine this root lets wait: the check goes
	// in, and the preload below runs only if the check fails in the browser.
	const check =
		!preload && canDeferEngineAfterChoice(snapshot)
			? storedChoiceCheck
			: undefined;
	return (
		<>
			{/* Runs before the preload below, which reads its result. */}
			{storedChoice ? (
				<script
					// oxlint-disable-next-line react/no-danger -- Inth's own code; values are escaped.
					dangerouslySetInnerHTML={{ __html: check ?? '' }}
					nonce={nonce}
					suppressHydrationWarning
				/>
			) : null}
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
				// oxlint-disable-next-line react/no-danger -- Inth's own constant script.
				dangerouslySetInnerHTML={{
					__html:
						chunks === undefined || (!preload && awaitsChoice(snapshot))
							? ''
							: enginePreloadScript(
									chunks,
									check === undefined ? undefined : boot.i
								),
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
	storedChoice,
	storedChoiceCheck,
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
			storedChoice={storedChoice}
			storedChoiceCheck={storedChoiceCheck}
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
	storedChoice,
	storedChoiceCheck,
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
			storedChoice={storedChoice}
			storedChoiceCheck={storedChoiceCheck}
			streamed={streamed}
		/>
	) : (
		<BootJSON
			boot={withRenderId({ s: server }, renderId)}
			chunks={chunks}
			preload={preload}
			storedChoice={storedChoice}
			storedChoiceCheck={storedChoiceCheck}
		/>
	);
};

/**
 * The snapshots a deferred root reads before its engine loads. Render it
 * inside the provider, in a Suspense boundary: with a streamed state it
 * waits for the state. In the browser it keeps the server's element.
 *
 * @internal
 */
export const ConsentBootData = (props: ConsentBootDataProps) => {
	if (typeof document !== 'undefined') {
		return (
			<>
				{props.storedChoice ? (
					<script
						// oxlint-disable-next-line react/no-danger -- Empty: keeps the server's script.
						dangerouslySetInnerHTML={{ __html: '' }}
						suppressHydrationWarning
					/>
				) : null}
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
			storedChoice={props.storedChoice}
			storedChoiceCheck={props.storedChoiceCheck}
		/>
	);
};
