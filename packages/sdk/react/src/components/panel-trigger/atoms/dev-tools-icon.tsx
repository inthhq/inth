import type { SVGProps } from 'react';

/**
 * Code icon for the DevTools item a trigger shows while `<ConsentDevTools>`
 * is mounted. Decorative; the item carries the accessible name.
 */
export const DevToolsIcon = (props: SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		focusable="false"
		{...props}
	>
		<path d="m18 16 4-4-4-4" />
		<path d="m6 8-4 4 4 4" />
		<path d="m14.5 4-5 16" />
	</svg>
);
