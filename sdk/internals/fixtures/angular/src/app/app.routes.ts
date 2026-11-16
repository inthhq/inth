import type { Routes } from '@angular/router';

import { HeadlessPage } from './headless-page';
import { HomePage } from './home-page';

export const routes: Routes = [
	{ component: HomePage, path: '' },
	// The same page with consent UI built on `HeadlessConsent`.
	{ component: HeadlessPage, path: 'headless' },
];
