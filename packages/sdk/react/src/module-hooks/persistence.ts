'use client';

import { createPersistence } from '@inth/sdk/modules/persistence';
import type {
	PersistenceHandle,
	PersistenceOptions,
} from '@inth/sdk/modules/persistence';
import { useEffect, useRef, useState } from 'react';

import { deferredModules } from '../deferred/registry';
import { useRequiredKernel } from './shared';

export type UsePersistenceOptions = Omit<PersistenceOptions, 'kernel'>;

export const usePersistence = function usePersistence(
	options: UsePersistenceOptions = {}
): PersistenceHandle {
	const kernel = useRequiredKernel();
	const current = useRef<PersistenceHandle | null>(null);
	const [handle, setHandle] = useState<PersistenceHandle>(() => ({
		clear: () => current.current?.clear(),
		dispose: () => {
			current.current?.dispose();
			current.current = null;
		},
		hydrate: () => current.current?.hydrate() ?? false,
		reconcile: () => current.current?.reconcile() ?? false,
	}));
	void setHandle;
	useEffect(() => {
		let created: PersistenceHandle | null = null;
		let disposed = false;
		const create = () => {
			created = createPersistence({
				kernel,
				now: options.now,
				skipHydration: options.skipHydration,
				storageConfig: options.storageConfig,
				sync: options.sync,
			});
			current.current = created;
		};
		// A deferred root's stand-in has no records to hydrate into before
		// its engine attaches. Wait for it, without loading it.
		const engine = deferredModules(kernel);
		if (engine) {
			// oxlint-disable-next-line promise/prefer-await-to-then -- An effect cannot await.
			void engine.then(() => {
				if (!disposed) {
					create();
				}
			});
		} else {
			create();
		}
		return () => {
			disposed = true;
			created?.dispose();
			current.current = null;
		};
	}, [
		kernel,
		options.now,
		options.skipHydration,
		options.storageConfig,
		options.sync,
	]);

	return handle;
};

export type { PersistenceHandle, PersistenceOptions };
