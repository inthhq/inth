import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// Zoneless, as the package is built for. Tests that need zone.js opt in
// by providing it themselves.
setupTestBed({ zoneless: true });
