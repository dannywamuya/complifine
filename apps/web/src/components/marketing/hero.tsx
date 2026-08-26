'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/marketing/section';
import { ProductFrame } from '@/components/marketing/product-frame';

const BENEFITS = [
	'Save hours before every audit',
	'Spend less on last-minute consultants',
	'Know what applies at your site today',
	'Walk in ready — not re-reading the PDF',
];

export function Hero() {
	const reduced = useReducedMotion();
	const ref = useRef<HTMLElement>(null);
	const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

	function onPointerMove(event: PointerEvent<HTMLElement>) {
		if (reduced || event.pointerType !== 'mouse') return;
		const box = ref.current?.getBoundingClientRect();
		if (!box) return;
		setSpot({ x: event.clientX - box.left, y: event.clientY - box.top });
	}

	return (
		<section
			ref={ref}
			className='relative overflow-hidden pt-14 pb-16 sm:pt-20 sm:pb-24'
			onPointerMove={onPointerMove}
			onPointerLeave={() => setSpot(null)}>
			<div className='pointer-events-none absolute inset-0' aria-hidden>
				<div className='marketing-grid absolute inset-0 opacity-70' />
				<div className='marketing-glow absolute inset-0' />
				{spot ? (
					<div
						className='absolute size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl'
						style={{ left: spot.x, top: spot.y }}
					/>
				) : null}
			</div>
			<Container className='relative grid items-center gap-10 lg:max-w-7xl lg:grid-cols-[2fr_3fr] lg:gap-10'>
				<div className='min-w-0 lg:pr-2'>
					<p className='marketing-fade-up font-mono text-[11px] font-medium tracking-[0.18em] text-primary uppercase'>
						Kenya · Horticulture · AI
					</p>
					{/* <h1
            className="marketing-fade-up font-heading mt-4 text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]"
            style={{ animationDelay: "0.08s" }}
          >
            Save time and cost on compliance.
          </h1> */}
					<h1
						className='marketing-fade-up font-heading mt-4 text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]'
						// className='font-heading mt-3 text-xl font-medium tracking-tight text-balance text-primary sm:text-2xl lg:text-[1.75rem]'
						aria-live='polite'>
						<RotatingBenefit lines={BENEFITS} />
					</h1>
					<p
						className='marketing-fade-up mt-4 max-w-[44ch] text-sm leading-relaxed text-muted-foreground sm:text-base'
						style={{ animationDelay: '0.2s' }}>
						The first Intelligent Compliance OS for horticulture in Kenya. Ask
						in plain words — AI cites GLOBALG.A.P. IFA v6 and SMETA 7.0, not a
						chatbot over PDFs.
					</p>
					<div
						className='marketing-fade-up mt-7 flex flex-wrap gap-3'
						style={{ animationDelay: '0.28s' }}>
						<Button asChild size='lg'>
							<Link href='/demo'>
								Book a demo
								<ArrowRight />
							</Link>
						</Button>
						<Button
							asChild
							variant='outline'
							size='lg'
							className='border-white/15 bg-transparent'>
							<Link href='/signup'>Create a producer account</Link>
						</Button>
					</div>
				</div>
				<ProductFrame />
			</Container>
		</section>
	);
}

function RotatingBenefit({ lines }: { lines: string[] }) {
	const reduced = useReducedMotion();
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (reduced) return;
		const id = window.setInterval(() => {
			setIndex((current) => (current + 1) % lines.length);
		}, 3200);
		return () => window.clearInterval(id);
	}, [reduced, lines.length]);

	if (reduced) {
		return <span>{lines[0]}</span>;
	}

	return (
		<AnimatePresence mode='wait'>
			<motion.span
				key={lines[index]}
				className='block'
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -8 }}
				transition={{ duration: 0.35 }}>
				{lines[index]}
			</motion.span>
		</AnimatePresence>
	);
}
