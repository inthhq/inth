'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Props for the ErrorBoundary component.
 *
 * @public
 */
interface ErrorBoundaryProps {
	children: ReactNode;

	/** UI to display when an error occurs. */
	fallback: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode);
}

/**
 * Internal state for the ErrorBoundary component.
 *
 * @internal
 */
interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

/**
 * Renders `fallback` in place of a child tree that throws, so a banner
 * error does not take down the host app.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<ErrorMessageType />}>
 *   <ComponentThatMayError />
 * </ErrorBoundary>
 * ```
 *
 * @public
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	private errorInfo: ErrorInfo | null = null;

	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { error: null, errorInfo: null, hasError: false };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error, errorInfo: null, hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		this.errorInfo = errorInfo;
		this.forceUpdate();
	}

	render() {
		if (this.state.hasError) {
			if (typeof this.props.fallback === 'function') {
				// oxlint-disable-next-line typescript/no-non-null-assertion -- it's fine
				return this.props.fallback(this.state.error!, this.errorInfo!);
			}
			return this.props.fallback;
		}

		return this.props.children;
	}
}
