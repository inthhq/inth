<script lang="ts">
	import { PrivacyChoicesLink } from '@inth/svelte';
</script>

<!-- A plain page under the prompt, with the persistent "Your Privacy
     Choices" link, as React's banner stories render it. -->
<main
	style="font-family: system-ui, sans-serif; line-height: 1.6; margin: 0 auto; max-width: 720px; min-height: 160vh; padding: 48px 24px;"
>
	<h1>Acme Outdoor</h1>
	<p>
		Tents, packs and stoves for every season. Browse the catalogue, read the
		field guides, or find a store near you.
	</p>
	<p>
		<a href="#catalogue">Catalogue</a> · <a href="#guides">Field guides</a>
	</p>
	<footer style="margin-top: 48px;">
		<PrivacyChoicesLink />
	</footer>
</main>
