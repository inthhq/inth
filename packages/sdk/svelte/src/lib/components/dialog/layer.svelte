<script lang="ts">
	/**
	 * One card: the main dialog or a phone sheet. Only the top layer is
	 * modal; a covered parent is inert, dims and steps back (NEST-03). Each
	 * layer has its own `role="status"` region (SR-01), which shows only
	 * messages the layer made, and none while it closes (SR-02).
	 */
	import { attachLiveRegion } from '@inth/sdk/ui/primitives/surface';
	import type { LiveRegion } from '@inth/sdk/ui/primitives/surface';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
	import type { Snippet } from 'svelte';

	import { getThemeContext } from '../../context.svelte';
	import Icon from '../parts/icon.svelte';
	import { cx, part } from '../parts/parts';

	let {
		layerEl = $bindable(null),
		titleEl = $bindable(null),
		bodyEl = $bindable(null),
		idPrefix,
		title,
		intro,
		closeLabel,
		onClose,
		footer,
		status,
		nested,
		top,
		closing = false,
		depth,
		eu,
		sheetId,
		noStyle = false,
		children,
	}: {
		layerEl?: HTMLElement | null;
		titleEl?: HTMLHeadingElement | null;
		bodyEl?: HTMLDivElement | null;
		idPrefix: string;
		title: string;
		intro: string | null;
		closeLabel: string;
		onClose: () => void;
		footer: Snippet;
		status: string;
		nested: boolean;
		top: boolean;
		closing?: boolean;
		depth: number;
		eu: boolean;
		sheetId?: string;
		noStyle?: boolean;
		children: Snippet;
	} = $props();

	const theme = getThemeContext();

	let statusEl = $state<HTMLDivElement | null>(null);
	let region: LiveRegion | null = null;
	$effect(() => {
		const element = statusEl;
		if (!element) {
			return;
		}
		const controller = attachLiveRegion(element);
		region = controller;
		return () => {
			controller();
			region = null;
		};
	});
	const shownStatus = $derived(top && !closing ? status : '');
	$effect(() => {
		// Read first, so the effect follows the text even before a region exists.
		const text = shownStatus;
		void statusEl;
		region?.render(text);
	});

	const titleId = $derived(`${idPrefix}-title`);
	const cardPart = $derived(
		part(
			nested ? 'consentDialogSheet' : 'consentDialogCard',
			theme.theme,
			styles.card,
			noStyle
		)
	);
	const cardStyle = $derived(
		[cardPart.style, `--consent-dialog-depth:${depth}`]
			.filter(Boolean)
			.join(';')
	);
	const headerPart = $derived(
		part('consentDialogHeader', theme.theme, styles.header, noStyle)
	);
	const titlePart = $derived(
		part('consentDialogTitle', theme.theme, styles.title, noStyle)
	);
	const introPart = $derived(
		part('consentDialogDescription', theme.theme, styles.intro, noStyle)
	);
	const contentPart = $derived(
		part(
			'consentDialogContent',
			theme.theme,
			[expandStyles.scroll, styles.body],
			noStyle
		)
	);
	const footerPart = $derived(
		part('consentDialogFooter', theme.theme, styles.footer, noStyle)
	);
</script>

<!-- Layers stack inside one backdrop and the top-layer trap; a native
     <dialog> brings its own top layer and Escape handling. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section
	bind:this={layerEl}
	class={cardPart.class}
	style={cardStyle}
	role="dialog"
	aria-modal={top && !closing ? true : undefined}
	aria-labelledby={titleId}
	data-regime={eu ? 'eu' : 'us'}
	data-nested={nested ? 'true' : undefined}
	data-nested-open={depth > 0 ? '' : undefined}
	data-state={closing ? 'closed' : 'open'}
	data-sheet={sheetId}
	inert={!top || closing}
	data-testid={nested ? 'consent-dialog-sheet' : 'consent-dialog-card'}
>
	<header
		class={headerPart.class}
		style={headerPart.style}
		data-testid={nested ? undefined : 'consent-dialog-header'}
	>
		<div>
			<h2
				bind:this={titleEl}
				class={titlePart.class}
				style={titlePart.style}
				id={titleId}
				tabindex="-1"
				data-testid={nested ? undefined : 'consent-dialog-title'}
			>
				{title}
			</h2>
			{#if intro}
				<p
					class={introPart.class}
					style={introPart.style}
					data-testid={nested ? undefined : 'consent-dialog-intro'}
				>
					{intro}
				</p>
			{/if}
		</div>
		<button
			type="button"
			class={cx(noStyle, styles.close)}
			aria-label={closeLabel}
			data-testid={nested
				? 'consent-dialog-sheet-close'
				: 'consent-dialog-close'}
			onclick={onClose}
		>
			<Icon
				name="close"
				size={16}
			/>
		</button>
	</header>
	<div
		bind:this={bodyEl}
		class={contentPart.class}
		style={contentPart.style}
		data-testid={nested ? undefined : 'consent-dialog-content'}
	>
		{@render children()}
	</div>
	<footer
		class={footerPart.class}
		style={footerPart.style}
		data-testid={nested ? undefined : 'consent-dialog-footer'}
	>
		{@render footer()}
	</footer>
	<div
		bind:this={statusEl}
		class={cx(noStyle, styles.visuallyHidden)}
		data-testid={nested ? undefined : 'consent-dialog-status'}
	></div>
</section>
