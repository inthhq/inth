'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

/** @public */
export interface AnimatedCollapseProps {
	isOpen: boolean;

	children: ReactNode;

	/**
	 * Duration of the animation in milliseconds.
	 * @default 250
	 */
	duration?: number;

	/**
	 * CSS easing function for the animation.
	 * @default 'cubic-bezier(0.33, 1, 0.68, 1)'
	 */
	easing?: string;

	/** Class for the wrapper element. */
	className?: string;
}

/**
 * Animates the height of collapsible content, then unmounts it once closed.
 *
 * @remarks
 * Uses a two-layer wrapper pattern:
 * - Outer wrapper handles ONLY height/overflow animation
 * - Children handle their own padding/margin/border styling
 *
 * This prevents style conflicts and ensures borders/padding are
 * properly clipped when collapsed.
 *
 * @example
 * ```tsx
 * <AnimatedCollapse isOpen={isExpanded}>
 *   <div className={styles.content}>
 *     Collapsible content with padding and borders
 *   </div>
 * </AnimatedCollapse>
 * ```
 *
 * @public
 */
export const AnimatedCollapse: FC<AnimatedCollapseProps> = ({
	isOpen,
	children,
	duration = 250,
	easing = 'cubic-bezier(0.33, 1, 0.68, 1)',
	className,
}) => {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const animationRef = useRef<number | null>(null);

	const [shouldRender, setShouldRender] = useState(isOpen);
	const [isAnimating, setIsAnimating] = useState(false);

	const [state, setState] = useState<{
		height: number | 'auto';
		overflow: 'hidden' | 'visible';
		transition: string;
	}>({
		height: isOpen ? 'auto' : 0,
		overflow: isOpen ? 'visible' : 'hidden',
		transition: 'none',
	});

	useLayoutEffect(() => {
		const wrapper = wrapperRef.current;
		const content = contentRef.current;
		let setupFrame: number | null = null;
		let transitionFrame: number | null = null;
		let removeTransitionEnd: (() => void) | null = null;

		const prefersReducedMotion = window.matchMedia(
			'(prefers-reduced-motion: reduce)'
		).matches;

		if (prefersReducedMotion) {
			setupFrame = requestAnimationFrame(() => {
				setShouldRender(isOpen);
				setIsAnimating(false);
				setState({
					height: isOpen ? 'auto' : 0,
					overflow: isOpen ? 'visible' : 'hidden',
					transition: 'none',
				});
			});
			return () => {
				if (setupFrame !== null) {
					cancelAnimationFrame(setupFrame);
				}
			};
		}

		if (animationRef.current !== null) {
			cancelAnimationFrame(animationRef.current);
		}

		if (isOpen) {
			setupFrame = requestAnimationFrame(() => {
				setShouldRender(true);
				setIsAnimating(true);

				// Measure in the next frame, once the content has rendered.
				animationRef.current = requestAnimationFrame(() => {
					const measuredContent = contentRef.current;
					if (!measuredContent) {
						setIsAnimating(false);
						return;
					}

					const naturalHeight = measuredContent.scrollHeight;

					setState({
						height: 0,
						overflow: 'hidden',
						transition: 'none',
					});

					transitionFrame = requestAnimationFrame(() => {
						setState({
							height: naturalHeight,
							overflow: 'hidden',
							transition: `height ${duration}ms ${easing}`,
						});

						// Back to auto so later content changes resize the wrapper.
						const handleTransitionEnd = (e: TransitionEvent) => {
							if (e.propertyName !== 'height') {
								return;
							}
							setState({
								height: 'auto',
								overflow: 'visible',
								transition: 'none',
							});
							setIsAnimating(false);
							wrapper?.removeEventListener(
								'transitionend',
								handleTransitionEnd
							);
							removeTransitionEnd = null;
						};

						if (!wrapper) {
							return;
						}
						wrapper.addEventListener('transitionend', handleTransitionEnd);
						removeTransitionEnd = () =>
							wrapper.removeEventListener('transitionend', handleTransitionEnd);
					});
				});
			});
		} else {
			if (!wrapper || !content) {
				setupFrame = requestAnimationFrame(() => {
					setShouldRender(false);
					setIsAnimating(false);
					setState({
						height: 0,
						overflow: 'hidden',
						transition: 'none',
					});
				});
				return () => {
					if (setupFrame !== null) {
						cancelAnimationFrame(setupFrame);
					}
				};
			}

			const currentHeight = content.scrollHeight;
			setupFrame = requestAnimationFrame(() => {
				setIsAnimating(true);
				setState({
					height: currentHeight,
					overflow: 'hidden',
					transition: 'none',
				});

				animationRef.current = requestAnimationFrame(() => {
					// Force a reflow so the browser starts the transition from the
					// measured height.
					void wrapper.offsetHeight;

					setState({
						height: 0,
						overflow: 'hidden',
						transition: `height ${duration}ms ${easing}`,
					});

					const handleTransitionEnd = (e: TransitionEvent) => {
						if (e.propertyName !== 'height') {
							return;
						}
						setShouldRender(false);
						setIsAnimating(false);
						wrapper.removeEventListener('transitionend', handleTransitionEnd);
						removeTransitionEnd = null;
					};

					wrapper.addEventListener('transitionend', handleTransitionEnd);
					removeTransitionEnd = () =>
						wrapper.removeEventListener('transitionend', handleTransitionEnd);
				});
			});
		}

		return () => {
			if (setupFrame !== null) {
				cancelAnimationFrame(setupFrame);
			}
			if (transitionFrame !== null) {
				cancelAnimationFrame(transitionFrame);
			}
			if (animationRef.current !== null) {
				cancelAnimationFrame(animationRef.current);
			}
			removeTransitionEnd?.();
		};
	}, [isOpen, duration, easing]);

	if (!isOpen && !shouldRender && !isAnimating) {
		return null;
	}

	return (
		<div
			ref={wrapperRef}
			className={className}
			style={{
				height: state.height,
				overflow: state.overflow,
				transition: state.transition,
			}}
		>
			{shouldRender && (
				<div
					ref={contentRef}
					style={{ overflow: 'hidden' }}
				>
					{children}
				</div>
			)}
		</div>
	);
};

AnimatedCollapse.displayName = 'AnimatedCollapse';
