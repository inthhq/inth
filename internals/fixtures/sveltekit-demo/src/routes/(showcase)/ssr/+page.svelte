<script lang="ts">
	import CTA from '#lib/components/cta.svelte';
	import Footer from '#lib/components/footer.svelte';
	import Header from '#lib/components/header.svelte';
	import Hero from '#lib/components/hero.svelte';
	import HowItWorks from '#lib/components/how-it-works.svelte';
	import Pricing from '#lib/components/pricing.svelte';
	import Stats from '#lib/components/stats.svelte';
	import Testimonials from '#lib/components/testimonials.svelte';
	import VideoDemo from '#lib/components/video-demo.svelte';
</script>

<main class="min-h-screen">
	<Header />
	<Hero />
	<Stats />
	<VideoDemo />
	<HowItWorks />
	<Pricing />
	<Testimonials />
	<CTA />
	<Footer />
</main>
