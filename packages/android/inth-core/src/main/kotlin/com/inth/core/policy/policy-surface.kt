package com.inth.core.policy

import com.inth.core.model.ConsentModel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A matched policy rule's `surface`: where its consent prompt sits and whether it may block.
 *
 * `PolicySurface` in `packages/sdk/schema/src/shared/policy/policy-surface.ts`. [StrictPolicyReader]
 * keeps it in canonical form, as `canonicalizePolicySurface` does on the web: the container's
 * position, edge or side is filled in, an edge style beside a card is dropped, a blocking
 * constraint the rule already implies is dropped, and a surface with nothing left in it is no
 * surface at all. A rule without one reads exactly as it did before `surface` existed.
 *
 * [container] and [edgeStyle] are defaults a host presentation overrides. [blocking] is a hard
 * constraint. None of it changes what is allowed: `surface` stays out of the policy, choice and
 * notice fingerprints.
 */
@Serializable
data class PolicySurface(
	val container: Container? = null,
	val edgeStyle: EdgeStyle? = null,
	val blocking: Blocking? = null,
) {
	/** The container a prompt renders in, written `{ "type": ..., <position|edge|side>: ... }`. */
	@Serializable
	sealed class Container {
		/** A card in a corner or the centre. */
		@Serializable
		@SerialName("card")
		data class Card(val position: CardPosition) : Container()

		/** A banner along one edge. */
		@Serializable
		@SerialName("banner")
		data class Banner(val edge: BannerEdge) : Container()

		/** A drawer from one side. */
		@Serializable
		@SerialName("drawer")
		data class Drawer(val side: DrawerSide) : Container()
	}

	/** Where a card sits. `start` and `end` follow the writing direction. */
	@Serializable
	enum class CardPosition(val wireName: String) {
		@SerialName("start") START("start"),
		@SerialName("end") END("end"),
		@SerialName("center") CENTER("center"),
	}

	/** The edge a banner occupies. */
	@Serializable
	enum class BannerEdge(val wireName: String) {
		@SerialName("bottom") BOTTOM("bottom"),
		@SerialName("top") TOP("top"),
	}

	/** The side a drawer slides in from. `start` and `end` follow the writing direction. */
	@Serializable
	enum class DrawerSide(val wireName: String) {
		@SerialName("bottom") BOTTOM("bottom"),
		@SerialName("top") TOP("top"),
		@SerialName("start") START("start"),
		@SerialName("end") END("end"),
	}

	/** `inset` floats the prompt off the edges with rounded corners; `flush` runs it edge to edge. */
	@Serializable
	enum class EdgeStyle(val wireName: String) {
		@SerialName("inset") INSET("inset"),
		@SerialName("flush") FLUSH("flush"),
	}

	/** The policy's constraint on blocking the app until a choice is made. */
	@Serializable
	enum class Blocking(val wireName: String) {
		@SerialName("forbidden") FORBIDDEN("forbidden"),
		@SerialName("allowed") ALLOWED("allowed"),
		@SerialName("required") REQUIRED("required"),
	}

	/**
	 * This surface in canonical form for a rule, or `null` when nothing is left in it.
	 * `canonicalizePolicySurface` in `@inth/sdk-schema`. The container already carries its
	 * default position, edge or side, because the reader fills it in.
	 */
	internal fun canonical(model: ConsentModel, prompt: PolicyPrompt): PolicySurface? {
		val edgeStyle = if (container is Container.Card) null else edgeStyle
		val implied = if (canBlock(model, prompt)) Blocking.ALLOWED else Blocking.FORBIDDEN
		val blocking = blocking?.takeUnless { it == Blocking.ALLOWED || it == implied }
		if (container == null && edgeStyle == null && blocking == null) return null
		return PolicySurface(container, edgeStyle, blocking)
	}

	companion object {
		/**
		 * Whether a rule can block at all: only a choice prompt outside the opt-out model has
		 * something to block for. `canPolicyBlock` in `@inth/sdk-schema`.
		 */
		fun canBlock(model: ConsentModel, prompt: PolicyPrompt): Boolean =
			prompt == PolicyPrompt.CHOICE && model != ConsentModel.OPT_OUT
	}
}

/**
 * The layout a policy's [PolicySurface] resolves to when the host sets no presentation.
 *
 * `resolveLayout` in `packages/sdk/core/src/libs/consent-layout.model.ts`, with only the policy's
 * container, edge style and blocking constraint as input, which is what the web passes it for an
 * install with no host presentation. The snapshot carries the [Viewport.PHONE] layout.
 *
 * The stock Compose presenter does not draw it yet: every native first layer is a modal screen
 * chosen by the consent UI theme's first layer. It is here so a host, or a custom presenter, can
 * honour the policy, and so a policy that forbids blocking is visible to the app.
 */
@Serializable
data class PolicyLayout(
	val type: ContainerType,
	val placement: Placement,
	val flow: Flow,
	/** Whether the prompt blocks the app until a choice is made. */
	val blocking: Boolean,
	val edgeStyle: PolicySurface.EdgeStyle,
) {
	/** The container type. */
	@Serializable
	enum class ContainerType {
		@SerialName("card") CARD,
		@SerialName("banner") BANNER,
		@SerialName("drawer") DRAWER,
	}

	/** Every resolved placement. */
	@Serializable
	enum class Placement(val wireName: String) {
		@SerialName("card-start") CARD_START("card-start"),
		@SerialName("card-end") CARD_END("card-end"),
		@SerialName("card-center") CARD_CENTER("card-center"),
		@SerialName("banner-bottom") BANNER_BOTTOM("banner-bottom"),
		@SerialName("banner-top") BANNER_TOP("banner-top"),
		@SerialName("drawer-bottom") DRAWER_BOTTOM("drawer-bottom"),
		@SerialName("drawer-top") DRAWER_TOP("drawer-top"),
		@SerialName("drawer-start") DRAWER_START("drawer-start"),
		@SerialName("drawer-end") DRAWER_END("drawer-end"),
		;

		internal companion object {
			fun of(name: String): Placement = entries.first { it.wireName == name }
		}
	}

	/**
	 * [EXPAND_IN_PLACE] shows a summary first and opens the choices in the same surface;
	 * [ALL_IN_ONE] shows the choices from the start.
	 */
	@Serializable
	enum class Flow {
		@SerialName("expand-in-place") EXPAND_IN_PLACE,
		@SerialName("all-in-one") ALL_IN_ONE,
	}

	/** The viewport class a layout is resolved for. The web switches to phone at 640 CSS pixels. */
	enum class Viewport { DESKTOP, PHONE }

	companion object {
		/**
		 * Resolve a canonical [surface] for a rule, with no host presentation.
		 *
		 * - A centred card always blocks. Where the rule cannot block, it moves to the `start` corner.
		 * - Blocking applies when the card is centred or the policy requires it, and only for a
		 *   choice prompt outside the opt-out model. A `forbidden` constraint always wins.
		 * - On a phone, `start` and `end` drawers become a bottom drawer that expands in place.
		 * - A card is always inset; the policy's edge style applies to banners and drawers.
		 */
		fun resolve(
			surface: PolicySurface,
			model: ConsentModel,
			prompt: PolicyPrompt,
			viewport: Viewport = Viewport.PHONE,
		): PolicyLayout {
			val constraint = surface.blocking ?: PolicySurface.Blocking.ALLOWED
			val blockable = constraint != PolicySurface.Blocking.FORBIDDEN && PolicySurface.canBlock(model, prompt)
			var container = surface.container ?: PolicySurface.Container.Card(PolicySurface.CardPosition.START)
			if (container == PolicySurface.Container.Card(PolicySurface.CardPosition.CENTER) && !blockable) {
				container = PolicySurface.Container.Card(PolicySurface.CardPosition.START)
			}
			if (viewport == Viewport.PHONE && container is PolicySurface.Container.Drawer &&
				(container.side == PolicySurface.DrawerSide.START || container.side == PolicySurface.DrawerSide.END)
			) {
				container = PolicySurface.Container.Drawer(PolicySurface.DrawerSide.BOTTOM)
			}
			val centred = container == PolicySurface.Container.Card(PolicySurface.CardPosition.CENTER)
			val blocking = (constraint == PolicySurface.Blocking.REQUIRED || centred) && blockable
			// `resolvePromptContainer` passes the policy's edge style only beside a container the
			// policy named that is not a card.
			val policyEdgeStyle = when (surface.container) {
				is PolicySurface.Container.Banner, is PolicySurface.Container.Drawer -> surface.edgeStyle
				else -> null
			}
			return when (container) {
				is PolicySurface.Container.Card -> PolicyLayout(
					ContainerType.CARD, Placement.of("card-${container.position.wireName}"),
					Flow.EXPAND_IN_PLACE, blocking, PolicySurface.EdgeStyle.INSET,
				)
				is PolicySurface.Container.Banner -> PolicyLayout(
					ContainerType.BANNER, Placement.of("banner-${container.edge.wireName}"),
					Flow.EXPAND_IN_PLACE, blocking, policyEdgeStyle ?: PolicySurface.EdgeStyle.INSET,
				)
				is PolicySurface.Container.Drawer -> PolicyLayout(
					ContainerType.DRAWER, Placement.of("drawer-${container.side.wireName}"),
					if (container.side == PolicySurface.DrawerSide.START || container.side == PolicySurface.DrawerSide.END) {
						Flow.ALL_IN_ONE
					} else {
						Flow.EXPAND_IN_PLACE
					},
					blocking, policyEdgeStyle ?: PolicySurface.EdgeStyle.INSET,
				)
			}
		}
	}
}
