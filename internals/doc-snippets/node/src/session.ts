/** Stands in for the app's own session lookup */
export const getSessionUser = (
	_request: Request
): Promise<{ readonly id: string } | null> => Promise.resolve(null);
