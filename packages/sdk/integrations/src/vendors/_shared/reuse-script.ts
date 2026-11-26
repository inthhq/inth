/**
 * The script-sharing helpers now live in the script loader, which shares
 * remote scripts the same way. Re-exported so vendor helpers import them
 * from one place.
 */
export {
	createScriptReuse,
	equalConfig,
	getScriptRegistrations,
} from '@inth/sdk/modules/script-loader';
