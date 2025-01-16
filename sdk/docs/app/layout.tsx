import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Body } from "./layout.client";
import { Analytics } from "@vercel/analytics/react"
const inter = Inter({
	subsets: ["latin"],
});

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<Body>
				<RootProvider>{children}</RootProvider>
				<Analytics/>
			</Body>
		</html>
	);
}
