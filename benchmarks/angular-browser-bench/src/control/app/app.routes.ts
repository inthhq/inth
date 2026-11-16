import type { Routes } from '@angular/router';

import { GateArticle } from '../../shared/gate-article';

// Served below the `/gate-control/` base href.
export const routes: Routes = [{ component: GateArticle, path: '' }];
