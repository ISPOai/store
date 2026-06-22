// next/link drop-in. Renders a plain <a>. Most of OpenCut's <Link> usage in
// editor-internal components is for external URLs (GitHub, docs); navigation
// to OpenCut's own routes is moot inside a ISPO iframe.

import type { AnchorHTMLAttributes, ReactNode, MouseEvent } from "react";

interface NextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
	href: string | { pathname?: string; query?: Record<string, string> };
	children?: ReactNode;
	prefetch?: boolean;
	replace?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	passHref?: boolean;
	legacyBehavior?: boolean;
}

function hrefToString(href: NextLinkProps["href"]): string {
	if (typeof href === "string") return href;
	const pathname = href.pathname ?? "/";
	if (!href.query) return pathname;
	const params = new URLSearchParams(href.query);
	const qs = params.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

function isExternal(href: string): boolean {
	return /^[a-z]+:/.test(href) || href.startsWith("//");
}

export default function Link({
	href,
	children,
	prefetch: _prefetch,
	replace: _replace,
	scroll: _scroll,
	shallow: _shallow,
	passHref: _passHref,
	legacyBehavior: _legacyBehavior,
	onClick,
	target,
	rel,
	...rest
}: NextLinkProps) {
	const resolvedHref = hrefToString(href);
	const external = isExternal(resolvedHref);

	function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
		if (onClick) onClick(event);
		if (event.defaultPrevented) return;
		if (external) return; // let the browser handle external links
		// Internal "navigation" inside a ISPO iframe is a no-op: there's no
		// app-router to push to. Prevent default so the iframe doesn't try to
		// reload itself.
		event.preventDefault();
	}

	return (
		<a
			href={resolvedHref}
			onClick={handleClick}
			target={external && !target ? "_blank" : target}
			rel={external && !rel ? "noopener noreferrer" : rel}
			{...rest}
		>
			{children}
		</a>
	);
}
