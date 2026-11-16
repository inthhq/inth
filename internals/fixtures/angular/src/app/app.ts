import { PlatformLocation } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DOCUMENT,
	inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet],
	selector: 'app-root',
	template: '<router-outlet />',
})
export class App {
	constructor() {
		// The Branded link turns on the token overrides in `style.css`. Set
		// on the server too, so the first paint is already branded.
		const search = new URLSearchParams(inject(PlatformLocation).search);
		if (search.get('design') === 'branded') {
			inject(DOCUMENT).documentElement.setAttribute('data-design', 'branded');
		}
	}
}
