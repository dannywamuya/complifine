import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SiteHeader } from '@/components/site-header';
import { ThemeProvider } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
	title: {
		default: 'CompliFine',
		template: '%s · CompliFine',
	},
	description:
		'Know what GLOBALG.A.P. IFA v6 and SMETA 7 require at your sites. Answers cite the published standard.',
	icons: {
		icon: [
			{ url: '/favicon.ico' },
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
		],
		apple: '/apple-touch-icon.png',
	},
	manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
	themeColor: '#111312',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang='en'
			suppressHydrationWarning
			className={cn(
				'overflow-x-hidden font-sans',
				geist.variable,
				geistMono.variable,
			)}>
			<body className='flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased'>
				<ThemeProvider>
					<TooltipProvider>
						<SiteHeader />
						<main className='flex min-w-0 w-full flex-1 flex-col overflow-x-hidden'>
							{children}
						</main>
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
