import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
	description: 'Manual side-by-side preview shell for inth CSS layer scenarios',
	title: 'inth CSS Layer Preview',
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
	<html lang="en">
		<body>{children}</body>
	</html>
);

export default RootLayout;
