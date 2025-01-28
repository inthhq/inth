import { FeaturesSection } from "./_components/features";
import { Hero } from "./_components/hero";

import { CTA } from "./_components/cta";
import { Examples } from "./_components/examples";
import { Footer } from "./_components/footer";
import type { Metadata } from "next/types";

export const metadata: Metadata = {
	title: "Koroflow",
	description:
		"A modern privacy consent solution that gives you full visibility into user privacy choices. Get powerful analytics, consent tracking, and privacy controls in one fast package",
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
