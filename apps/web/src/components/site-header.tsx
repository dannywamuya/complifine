'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { api, startSessionKeepAlive } from '@/lib/api';
import type { Me } from '@/lib/farm';
import { cn } from '@/lib/utils';

const ANCHORS = [
	{ href: '#features', label: 'Features' },
	{ href: '#how-it-works', label: 'How it works' },
	{ href: '#standards', label: 'Standards' },
	{ href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
	const path = usePathname();
	const [me, setMe] = useState<Me | null>(null);
	const [scrolled, setScrolled] = useState(false);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (path.startsWith('/app') || path.startsWith('/preview')) return;
		api<Me>('/auth/me')
			.then(setMe)
			.catch(() => setMe(null));
	}, [path]);

	useEffect(() => {
		if (!me || path.startsWith('/app')) return;
		return startSessionKeepAlive();
	}, [me, path]);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, []);

	if (path.startsWith('/app') || path.startsWith('/preview')) return null;

	const home = path === '/';
	const anchors = ANCHORS.map((item) => ({
		...item,
		href: home ? item.href : `/${item.href}`,
	}));

	return (
		<header
			className={cn(
				'sticky top-0 z-50 min-w-0 border-b border-white/10 bg-black/80 text-white transition-[backdrop-filter,background-color] duration-500',
				scrolled ? 'bg-black/75 backdrop-blur-md' : 'bg-black',
			)}>
			<div className='mx-auto flex h-16 min-w-0 max-w-6xl items-center gap-4 px-4 sm:px-6'>
				<Link href='/' className='shrink-0' aria-label='CompliFine home'>
					<BrandLogo />
				</Link>
				<nav
					className='hidden min-w-0 flex-1 items-center gap-1 lg:flex'
					aria-label='Primary'>
					{anchors.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className='rounded-md px-2.5 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50'>
							{item.label}
						</Link>
					))}
				</nav>
				<div className='ml-auto hidden items-center gap-2 sm:flex'>
					<HeaderActions me={me} />
				</div>
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger asChild>
						<Button
							variant='ghost'
							size='icon'
							className='ml-auto text-white hover:bg-white/10 hover:text-white lg:hidden'
							aria-label='Open menu'>
							<Menu />
						</Button>
					</SheetTrigger>
					<SheetContent side='right' className='bg-black text-white'>
						<SheetHeader>
							<SheetTitle className='sr-only'>Menu</SheetTitle>
							<BrandLogo className='h-6' />
						</SheetHeader>
						<nav className='flex flex-col gap-1 px-4' aria-label='Mobile'>
							{anchors.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									onClick={() => setOpen(false)}
									className='rounded-md px-2 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white'>
									{item.label}
								</Link>
							))}
						</nav>
						<div className='mt-4 flex flex-col gap-2 px-4 sm:hidden'>
							<HeaderActions me={me} stacked />
						</div>
					</SheetContent>
				</Sheet>
			</div>
		</header>
	);
}

function HeaderActions({
	me,
	stacked = false,
}: {
	me: Me | null;
	stacked?: boolean;
}) {
	const className = stacked ? 'w-full justify-center' : undefined;

	if (me) {
		return (
			<Button asChild size='sm' className={className}>
				<Link href='/app'>Open chat</Link>
			</Button>
		);
	}

	return (
		<>
			<Button
				asChild
				variant='ghost'
				size='sm'
				className={cn(
					'text-white hover:bg-white/10 hover:text-white',
					className,
				)}>
				<Link href='/demo'>Book a demo</Link>
			</Button>
			<Button
				asChild
				variant='outline'
				size='sm'
				className={cn(
					'border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white',
					className,
				)}>
				<Link href='/login'>Sign in</Link>
			</Button>
			<Button asChild size='sm' className={className}>
				<Link href='/signup'>Create account</Link>
			</Button>
		</>
	);
}
