/** @vitest-environment jsdom */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { afterPriorityImages } from '../page-globals';

afterEach(() => {
	document.body.replaceChildren();
	Reflect.deleteProperty(document, 'readyState');
});

const priorityImage = (complete: boolean): HTMLImageElement => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: complete });
	document.body.append(image);
	return image;
};

test('while the document parses, waits for every priority image in the finished HTML', () => {
	Object.defineProperty(document, 'readyState', {
		configurable: true,
		value: 'loading',
	});
	priorityImage(true);
	const done = vi.fn();
	afterPriorityImages(done);
	expect(done).not.toHaveBeenCalled();

	const later = priorityImage(false);
	Object.defineProperty(document, 'readyState', {
		configurable: true,
		value: 'interactive',
	});
	document.dispatchEvent(new Event('DOMContentLoaded'));
	expect(done).not.toHaveBeenCalled();

	later.dispatchEvent(new Event('load'));
	expect(done).toHaveBeenCalledTimes(1);
});
