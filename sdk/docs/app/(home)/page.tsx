
import { Features } from "@/components/sections/features";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { siteConfig } from "@/lib/config";
import { Metadata } from "next";

export const page = {
  author: "Christopher Burns",
  description:
    siteConfig.description,
  title: "Better Events",
};

export const metadata: Metadata = {
  description: page.description,
  title: page.title,
};


export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <Footer />
    </main>
  );
}
