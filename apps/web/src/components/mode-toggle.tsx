'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

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

	const current =
		OPTIONS.find((option) => option.id === theme) ?? OPTIONS[2];
	const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length]!;
	const Icon = mounted ? current.icon : Monitor;

	return (
		<Button
			type='button'
			variant='ghost'
			size='icon'
			aria-label={`Color theme: ${current.label}. Switch to ${next.label}.`}
			title={`${current.label} — click for ${next.label}`}
			onClick={() => setTheme(next.id)}
			className='text-muted-foreground'>
			<Icon />
			<span className='sr-only'>{current.label}</span>
		</Button>
	);
}
