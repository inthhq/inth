'use client';

import { useEffect, useLayoutEffect } from 'react';

/**
 * A layout effect in the browser; on the server, where React warns about
 * layout effects and none would run anyway, a plain effect.
 *
 * @internal
 */
export const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;
