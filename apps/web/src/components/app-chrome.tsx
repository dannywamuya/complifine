'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, startSessionKeepAlive } from '@/lib/api';
import type { Me, OrgPayload } from '@/lib/farm';
import { needsSetup, ORG_CHANGED } from '@/lib/farm';
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/app-sidebar';
import {
	APP_HEADER_ACTIONS_ID,
	APP_HEADER_EXTRA_ID,
} from '@/components/app-header';
import { AppChromeSkeleton } from '@/components/app-skeletons';
import { Toaster } from '@/components/ui/sonner';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ModeToggle } from '@/components/mode-toggle';
import { OnboardingTrigger } from '@/components/onboarding-trigger';

function initials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}

export function AppChrome({
	children,
	defaultSidebarOpen = true,
}: {
	children: ReactNode;
	defaultSidebarOpen?: boolean;
}) {
	const path = usePathname();
	const router = useRouter();
	const [me, setMe] = useState<Me | null | undefined>(undefined);
	const [org, setOrg] = useState<OrgPayload | null | undefined>(undefined);
	const orgName = org?.organization?.name ?? null;

	useEffect(() => {
		api<Me>('/auth/me')
			.then(setMe)
			.catch((err) => {
				if (!(err instanceof ApiError) || err.status !== 401) return;
				const next =
					path === '/app/ask' || path.startsWith('/app/search')
						? '/app'
						: path || '/app';
				router.replace(`/login?next=${encodeURIComponent(next)}`);
			});
	}, [path, router]);

	useEffect(() => {
		if (!me) return;
		const load = () =>
			api<OrgPayload>('/org')
				.then(setOrg)
				.catch(() => setOrg(null));
		const onChange = (event: Event) => {
			if (event instanceof CustomEvent && event.detail) {
				setOrg(event.detail as OrgPayload);
				return;
			}
			void load();
		};
		void load();
		window.addEventListener(ORG_CHANGED, onChange);
		return () => window.removeEventListener(ORG_CHANGED, onChange);
	}, [me]);

	useEffect(() => {
		if (!me) return;
		return startSessionKeepAlive();
	}, [me]);

	const chatHome = path === '/app';
	const onCriteria = path.startsWith('/app/criteria');
	const onCompany = path.startsWith('/app/company');
	const onSetup = path.startsWith('/app/setup');
	const setup = onSetup || needsSetup(org);

	useEffect(() => {
		if (!me || org === undefined) return;
		if (needsSetup(org) && !onSetup) {
			router.replace('/app/setup');
			return;
		}
		if (!needsSetup(org) && onSetup) {
			router.replace('/app');
		}
	}, [me, org, onSetup, router]);

	if (!me || org === undefined) {
		return (
			<AppChromeSkeleton path={path} sidebarOpen={defaultSidebarOpen} />
		);
	}

	const userMenu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant='ghost' size='sm' className='gap-2 rounded-full px-1.5'>
					<Avatar size='sm'>
						<AvatarFallback>{initials(me.name) || 'U'}</AvatarFallback>
					</Avatar>
					<span className='hidden max-w-40 truncate sm:inline'>{me.name}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-56'>
				<DropdownMenuLabel className='font-normal'>
					<p className='truncate text-sm font-medium'>{me.name}</p>
					<p className='truncate text-xs text-muted-foreground'>{me.email}</p>
					{orgName ? (
						<p className='mt-1 truncate text-xs text-muted-foreground'>
							{orgName}
						</p>
					) : null}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await api('/auth/logout', { method: 'POST' });
						window.location.href = '/';
					}}>
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<SidebarProvider
			defaultOpen={defaultSidebarOpen}
			className='min-h-svh overflow-x-hidden bg-muted'>
			<AppSidebar setup={setup} />
			<SidebarInset className='min-h-svh min-w-0 overflow-hidden bg-card md:my-2 md:mr-2 md:ml-0 md:h-[calc(100svh-1rem)] md:min-h-0 md:rounded-2xl md:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_rgb(0_0_0/0.05)]'>
				<header className='flex h-14 shrink-0 items-center gap-2 border-b border-border bg-transparent px-3 sm:px-4'>
					{setup ? null : <SidebarTrigger className='rounded-xl' />}
					{setup ? null : <Separator orientation='vertical' className='h-4' />}
					<p className='shrink-0 truncate text-sm font-medium tracking-tight'>
						{onSetup ? 'Set up' : onCriteria ? 'Catalog' : onCompany ? 'Company' : 'Chat'}
					</p>
					<div
						id={APP_HEADER_EXTRA_ID}
						className='flex min-w-0 flex-1 items-center'
					/>
					<div className='ml-auto flex shrink-0 items-center gap-2'>
						<div
							id={APP_HEADER_ACTIONS_ID}
							className='flex items-center gap-0.5'
						/>
						{setup ? null : <OnboardingTrigger />}
						<ModeToggle />
						{userMenu}
					</div>
				</header>
				<div
					className={
						chatHome
							? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
							: 'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-8'
					}>
					{children}
				</div>
			</SidebarInset>
			<Toaster />
		</SidebarProvider>
	);
}
