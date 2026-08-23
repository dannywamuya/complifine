'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { parseAnswerSections } from '../parse-answer.ts';
import { MarkdownView } from './markdown-view.tsx';

export function AnswerArticle({
	text,
	streaming = false,
	criterionHref,
}: {
	text: string;
	streaming?: boolean;
	criterionHref?: (id: string) => string;
}) {
	const { summary, detail, practical } = parseAnswerSections(text);

	if (!summary && !detail && !practical) {
		return (
			<MarkdownView
				text={text}
				streaming={streaming}
				criterionHref={criterionHref}
			/>
		);
	}

	return (
		<div className='space-y-3'>
			{summary ? (
				<section className='rounded-2xl border border-[color-mix(in_oklch,var(--cf-accent)_22%,transparent)] bg-(--cf-accent-soft) px-5 py-4'>
					<p className='text-[11px] font-medium tracking-[0.16em] text-(--cf-accent) uppercase'>
						At a glance
					</p>
					<div className='mt-2 text-[1.05rem] leading-snug'>
						<MarkdownView
							text={summary}
							streaming={streaming && !detail && !practical}
							criterionHref={criterionHref}
						/>
					</div>
				</section>
			) : null}
			{detail ? (
				<CollapsibleSection title='What the standard says' defaultOpen>
					<MarkdownView
						text={detail}
						streaming={streaming && !practical}
						criterionHref={criterionHref}
					/>
				</CollapsibleSection>
			) : null}
			{practical ? (
				<CollapsibleSection
					title='What this means'
					defaultOpen
					className='rounded-2xl bg-(--cf-bg-elevated) px-5 py-3 ring-1 ring-(--cf-border)'>
					<MarkdownView
						text={practical}
						streaming={streaming}
						criterionHref={criterionHref}
					/>
				</CollapsibleSection>
			) : null}
		</div>
	);
}

function CollapsibleSection({
	title,
	defaultOpen,
	className,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<details open={defaultOpen} className={className ?? 'space-y-2'}>
			<summary className='flex cursor-pointer list-none items-center justify-between gap-2 py-1'>
				<p className='text-[11px] font-medium tracking-[0.16em] text-(--cf-fg-subtle) uppercase'>
					{title}
				</p>
				<ChevronDown
					className='cf-chat-chevron size-3.5 shrink-0 text-(--cf-fg-subtle)'
					aria-hidden
				/>
			</summary>
			<div className='mt-2'>{children}</div>
		</details>
	);
}
