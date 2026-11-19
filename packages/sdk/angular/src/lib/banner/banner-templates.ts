import { Directive, inject, TemplateRef } from '@angular/core';

/** What the banner's title and description templates render with. */
export interface BannerCopyContext {
	/** The resolved copy: the input, else the translation. */
	readonly $implicit: string;
	/** The policy asks for a notice, not a choice. */
	readonly notice: boolean;
}

/** A banner action id, from the policy's action groups. */
export type ConsentBannerButton = 'reject' | 'accept' | 'customize' | 'dismiss';

/** What the banner's action template renders with, once per action. */
export interface BannerActionContext {
	/** The action id. */
	readonly $implicit: ConsentBannerButton;
	/** The policy marks the action as primary. */
	readonly primary: boolean;
	/** The resolved button text. */
	readonly label: string;
	/** The themed button variant. */
	readonly variant: 'primary' | 'neutral';
	/** The themed button mode. */
	readonly mode: 'filled' | 'stroke' | 'lighter' | 'ghost';
	/**
	 * The stock button's `data-testid`, such as
	 * `consent-banner-accept-button`.
	 */
	readonly testId: string;
}

/**
 * Replaces the banner title's text. The `<h2>` and its classes stay.
 *
 * @example
 * ```html
 * <inth-consent-banner>
 *   <ng-template inthConsentBannerTitle let-title>🍪 {{ title }}</ng-template>
 * </inth-consent-banner>
 * ```
 */
@Directive({ selector: 'ng-template[inthConsentBannerTitle]' })
export class ConsentBannerTitle {
	/** @internal */
	readonly template = inject<TemplateRef<BannerCopyContext>>(TemplateRef);

	/** @internal */
	static ngTemplateContextGuard(
		_directive: ConsentBannerTitle,
		_context: unknown
	): _context is BannerCopyContext {
		return true;
	}
}

/**
 * Replaces the banner description's text. The legal links still follow it.
 *
 * @example
 * ```html
 * <inth-consent-banner>
 *   <ng-template inthConsentBannerDescription>
 *     We use cookies. <a href="/cookies">Learn more</a>
 *   </ng-template>
 * </inth-consent-banner>
 * ```
 */
@Directive({ selector: 'ng-template[inthConsentBannerDescription]' })
export class ConsentBannerDescription {
	/** @internal */
	readonly template = inject<TemplateRef<BannerCopyContext>>(TemplateRef);

	/** @internal */
	static ngTemplateContextGuard(
		_directive: ConsentBannerDescription,
		_context: unknown
	): _context is BannerCopyContext {
		return true;
	}
}

/**
 * Renders each action button in place of the stock one. The policy still
 * decides which actions show and how they group.
 *
 * @example
 * ```html
 * <inth-consent-banner>
 *   <ng-template inthConsentBannerAction let-action let-label="label" let-primary="primary">
 *     <button
 *       inth-consent-button
 *       [action]="action"
 *       [variant]="primary ? 'primary' : 'neutral'"
 *     >
 *       {{ label }}
 *     </button>
 *   </ng-template>
 * </inth-consent-banner>
 * ```
 */
@Directive({ selector: 'ng-template[inthConsentBannerAction]' })
export class ConsentBannerAction {
	/** @internal */
	readonly template = inject<TemplateRef<BannerActionContext>>(TemplateRef);

	/** @internal */
	static ngTemplateContextGuard(
		_directive: ConsentBannerAction,
		_context: unknown
	): _context is BannerActionContext {
		return true;
	}
}
