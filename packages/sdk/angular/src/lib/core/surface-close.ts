import { InjectionToken } from '@angular/core';

/**
 * Called by a stock action button after its action closed the surface it
 * sits in, such as a dialog's Save. A surface whose visibility a parent
 * owns provides it, so the parent hears the close.
 *
 * @internal
 */
export const SURFACE_CLOSED = new InjectionToken<() => void>(
	'C15T_SURFACE_CLOSED'
);
