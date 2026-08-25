import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Wordmark. Dark surfaces use the full PNG; light surfaces use the mark + type. */
export function BrandLogo({
	className,
	collapsed = false,
	priority = true,
	tone = 'dark',
}: {
	className?: string;
	collapsed?: boolean;
	priority?: boolean;
	tone?: 'dark' | 'light';
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

	if (tone === 'light') {
		return (
			<span className={cn('inline-flex items-center gap-2', className)}>
				<BrandMark className='size-8' />
				<span className='text-[1.05rem] font-semibold tracking-tight text-zinc-950'>
					Compli<span className='text-primary'>Fine</span>
				</span>
			</span>
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

function BrandMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 32 32'
			className={cn('shrink-0', className)}
			aria-hidden
		>
			<rect
				x='5'
				y='6'
				width='8'
				height='22'
				rx='4'
				transform='rotate(-35 9 17)'
				className='fill-zinc-900'
			/>
			<rect
				x='13'
				y='4'
				width='10'
				height='24'
				rx='5'
				transform='rotate(-35 18 16)'
				className='fill-primary'
			/>
		</svg>
	);
}
