import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Wordmark for dark surfaces. Collapsed state uses the two-bar mark only. */
export function BrandLogo({
	className,
	collapsed = false,
	priority = true,
}: {
	className?: string;
	collapsed?: boolean;
	priority?: boolean;
}) {
	if (collapsed) {
		return (
			<Image
				src='/android-chrome-192x192.png'
				alt='CompliFine'
				width={32}
				height={32}
				className={cn('size-8 shrink-0 rounded-md', className)}
				priority={priority}
			/>
		);
	}

	return (
		<Image
			src='/brand/complifine.png'
			alt='CompliFine'
			width={2430}
			height={600}
			className={cn('h-9 w-auto object-contain object-left', className)}
			priority={priority}
		/>
	);
}
