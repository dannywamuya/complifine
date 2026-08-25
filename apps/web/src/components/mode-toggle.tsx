'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const OPTIONS = [
	{ id: 'light', label: 'Light', icon: Sun },
	{ id: 'dark', label: 'Dark', icon: Moon },
	{ id: 'system', label: 'System', icon: Monitor },
] as const;

export function ModeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div
			role='group'
			aria-label='Color theme'
			className='flex rounded-xl bg-muted p-0.5'>
			{OPTIONS.map((option) => {
				const Icon = option.icon;
				const selected = mounted && theme === option.id;
				return (
					<button
						key={option.id}
						type='button'
						aria-pressed={selected}
						aria-label={option.label}
						title={option.label}
						onClick={() => setTheme(option.id)}
						className={cn(
							'inline-flex size-8 items-center justify-center rounded-lg transition-colors',
							selected
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground',
						)}>
						<Icon className='size-3.5' />
					</button>
				);
			})}
		</div>
	);
}
