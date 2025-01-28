import { FeaturesSection } from "./_components/features";
import { Hero } from "./_components/hero";

import { CTA } from "./_components/cta";
import { Examples } from "./_components/examples";
import { Footer } from "./_components/footer";
import type { Metadata } from "next/types";
import { siteConfig } from "./config";

export const metadata: Metadata = {
	title: `${siteConfig.hero.title} | Koroflow`,
	description: siteConfig.hero.description,
};

export default function HomePage() {
	return (
		<>
			<Hero />
			{/* <ComponentsSection /> */}
			<FeaturesSection />
			<Examples />
			<CTA />
			<Footer />
		</>
	);
}
