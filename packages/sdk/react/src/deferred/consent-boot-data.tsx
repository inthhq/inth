'use client';

/**
 * The boot data a deferred root renders: the server's snapshots in the
 * HTML (`server-boot-data.tsx`), kept as they are in the browser. Loaded
 * with the engine, never in the first-load chunk.
 *
 * @packageDocumentation
 * @internal
 */

import { CONSENT_BOOT_ATTRIBUTE } from './boot';
import { ServerBootData } from './server-boot-data';
import type { ConsentBootDataProps } from './server-boot-data';

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
