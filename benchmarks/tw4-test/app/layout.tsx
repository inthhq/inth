import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
	description: 'Manual CSS review harness for Tailwind CSS 4 and inth',
	title: 'TW4 + inth CSS Layer Test',
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
	<html lang="en">
		<body>{children}</body>
	</html>
);

export default RootLayout;
