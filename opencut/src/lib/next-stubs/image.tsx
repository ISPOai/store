// next/image drop-in. Renders a plain <img>. We accept the Next.js-shaped
// props and pass through the ones a plain <img> understands, dropping the
// optimization-related ones (priority, placeholder, blurDataURL, loader, etc.)
// since there's no Next image server here.

import type { CSSProperties } from "react";

interface NextImageProps {
	src: string | { src: string; width?: number; height?: number };
	alt?: string;
	width?: number;
	height?: number;
	className?: string;
	style?: CSSProperties;
	fill?: boolean;
	priority?: boolean;
	loading?: "lazy" | "eager";
	sizes?: string;
	quality?: number;
	placeholder?: "blur" | "empty";
	blurDataURL?: string;
	onLoad?: () => void;
	onError?: () => void;
	draggable?: boolean;
	unoptimized?: boolean;
}

export default function Image(props: NextImageProps) {
	const {
		src,
		width,
		height,
		className,
		style,
		fill,
		loading,
		onLoad,
		onError,
		draggable,
	} = props;

	const resolvedSrc = typeof src === "string" ? src : src.src;
	const fillStyle: CSSProperties = fill
		? {
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				objectFit: "cover",
				...style,
			}
		: style ?? {};

	return (
		<img
			src={resolvedSrc}
			width={fill ? undefined : width}
			height={fill ? undefined : height}
			className={className}
			style={fillStyle}
			loading={loading}
			onLoad={onLoad}
			onError={onError}
			draggable={draggable}
		/>
	);
}
