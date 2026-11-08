import { createFileRoute } from '@tanstack/react-router';

import { GateArticle } from '../bench/gate-article';
import { appStylesheetHead } from '../bench/stylesheets';

/** The gate article without any consent library: the LCP control. */
export const Route = createFileRoute('/gate-control')({
	component: GateArticle,
	head: appStylesheetHead,
});
