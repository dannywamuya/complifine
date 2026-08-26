'use client';

import { BookOpen, Download, FileCode2, PanelLeft } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { farmContextNote } from '../ask-context.ts';
import { cn } from '../cn.ts';
import { extractArtifacts } from '../markdown-stream.ts';
import { useChat } from '../store/use-chat.ts';
import {
	SITE_KEY,
	type ChatMode,
	type ModelOption,
	type SelectOption,
} from '../types.ts';
import { ArtifactsPanel } from './artifacts-panel.tsx';
import { Composer } from './composer.tsx';
import { SuggestionPills, type EmptyFeature } from './empty-state.tsx';
import { MenuSelect } from './select.tsx';
import { IconButton } from './primitives.tsx';
import { OfflineBanner } from './offline-banner.tsx';
import { ConversationSidebar } from './sidebar.tsx';
import { SourcesRail } from './sources-rail.tsx';
import { ThreadView } from './thread-view.tsx';

export interface ChatShellProps {
	apiBase: string;
	className?: string;
	/** `embedded` opens history as a drawer — use inside app chrome. */
	variant?: 'standalone' | 'embedded';
	title?: string;
	eyebrow?: string;
	titleId?: string;
	emptyTitle?: string;
	emptyBody?: string;
	emptyGreeting?: string;
	emptyFeatures?: EmptyFeature[];
	emptyBlobLines?: string[];
	suggestions?: string[];
	versionOptions?: SelectOption[];
	kindOptions?: SelectOption[];
	showKindFilter?: boolean;
	showSources?: boolean;
	modes?: ChatMode[];
	defaultMode?: ChatMode;
	defaultVersion?: string;
	defaultKind?: string;
	models?: ModelOption[];
	criterionHref?: (id: string) => string;
	placeholder?: string;
	footer?: string;
	organizationName?: string;
	siteOptions?: SelectOption[];
	defaultSiteId?: string;
	profileHref?: string;
	scopeEditionLabels?: string[];
	/** When true, the host owns conversation history (producer app sidebar). */
	hideHistory?: boolean;
	/** Open this conversation on mount / when the id changes. */
	conversationId?: string | null;
	onConversationId?: (id: string | null) => void;
	onFeedback?: (messageId: string, vote: 'up' | 'down' | null) => void;
	/** Host chrome header targets. When set, the shell does not render its own bar. */
	headerPortal?: { extra: string; actions: string };
}

const DEFAULT_SUGGESTIONS = [
	'When can workers go back into a field after spraying?',
	'Is irrigation water testing a Major Must?',
	'What changes between Smart and GFS for crop protection?',
	"Do harvest hygiene rules still apply if we don't harvest?",
];

const GUTTER = 'w-full px-4 sm:px-6';
const COLUMN = 'mx-auto w-full max-w-3xl px-4 sm:px-6';

function readStoredSite(): string {
	if (typeof window === 'undefined') return '';
	try {
		return window.localStorage.getItem(SITE_KEY) ?? '';
	} catch {
		return '';
	}
}

export function ChatShell({
	apiBase,
	className,
	variant = 'standalone',
	title = 'Ask the standard',
	eyebrow,
	titleId,
	emptyTitle = 'Ask in the words you would use on site.',
	emptyBody = '',
	emptyGreeting,
	emptyFeatures,
	emptyBlobLines,
	suggestions = DEFAULT_SUGGESTIONS,
	versionOptions,
	kindOptions,
	showKindFilter,
	showSources = true,
	modes = ['answer', 'passages'],
	defaultMode = 'answer',
	defaultVersion = 'all',
	defaultKind = 'requirements',
	models,
	criterionHref,
	placeholder,
	footer = 'Answers are grounded in retrieved text. Your certification body decides binding cases.',
	organizationName,
	siteOptions,
	defaultSiteId,
	profileHref,
	scopeEditionLabels,
	hideHistory = false,
	conversationId,
	onConversationId,
	onFeedback,
	headerPortal,
}: ChatShellProps) {
	const embedded = variant === 'embedded';
	const [siteId, setSiteId] = useState(() => defaultSiteId || readStoredSite());
	const knownSiteId =
		siteId && siteOptions?.some((option) => option.value === siteId)
			? siteId
			: undefined;
	const siteLabel = siteOptions?.find(
		(option) => option.value === siteId,
	)?.label;
	const contextNote = farmContextNote({
		organizationName,
		siteLabel,
		editionLabels: scopeEditionLabels,
	});

	const chat = useChat({
		apiBase,
		defaultMode,
		defaultVersion,
		defaultKind,
		siteId: knownSiteId,
		contextNote,
		onFeedback,
	});
	const [mobile, setMobile] = useState(false);
	const [modelId, setModelId] = useState(models?.[0]?.id);
	const [sourcesOpen, setSourcesOpen] = useState(false);

	const drawerSidebar = !hideHistory && (embedded || mobile);
	const showHostedHistory = hideHistory;

	const onConversationIdRef = useRef(onConversationId);
	onConversationIdRef.current = onConversationId;
	const conversationPropRef = useRef<string | null | undefined>(undefined);
	const skipIdNotify = useRef(true);

	useEffect(() => {
		if (skipIdNotify.current) {
			skipIdNotify.current = false;
			return;
		}
		onConversationIdRef.current?.(chat.activeId);
	}, [chat.activeId]);

	useEffect(() => {
		const next = conversationId ?? null;
		const previous = conversationPropRef.current;
		conversationPropRef.current = next;
		if (next) {
			if (next !== chat.activeId) void chat.openConversation(next);
			return;
		}
		if (previous) chat.newChat();
		// chat methods are stable enough; avoid retriggering on every send.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [conversationId]);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		const apply = () => setMobile(mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	}, []);

	useEffect(() => {
		if (siteOptions === undefined) return;
		if (siteOptions.length === 0) {
			if (siteId) setSiteId('');
			try {
				window.localStorage.removeItem(SITE_KEY);
			} catch {
				/* ignore quota */
			}
			return;
		}
		if (siteId && siteOptions.some((option) => option.value === siteId)) return;
		const stored = readStoredSite();
		const next =
			(stored && siteOptions.some((option) => option.value === stored)
				? stored
				: null) ??
			defaultSiteId ??
			siteOptions[0]?.value ??
			'';
		setSiteId(next);
		try {
			if (next) window.localStorage.setItem(SITE_KEY, next);
			else window.localStorage.removeItem(SITE_KEY);
		} catch {
			/* ignore quota */
		}
	}, [siteOptions, siteId, defaultSiteId]);

	function chooseSite(next: string) {
		setSiteId(next);
		try {
			if (next) window.localStorage.setItem(SITE_KEY, next);
			else window.localStorage.removeItem(SITE_KEY);
		} catch {
			/* ignore quota */
		}
	}

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
			if (event.key === 'Escape') {
				chat.setSidebarOpen(false);
				setSourcesOpen(false);
			}
			if (
				!typing &&
				event.key.toLowerCase() === 'n' &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				chat.newChat();
			}
			if (!typing && event.key === '/') {
				if (embedded) return;
				event.preventDefault();
				const search = document.getElementById(
					'cf-chat-search',
				) as HTMLInputElement | null;
				if (search) {
					search.focus();
					return;
				}
				document
					.querySelector<HTMLTextAreaElement>(
						'.cf-chat textarea[aria-label="Message"]',
					)
					?.focus();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [chat]);

	useEffect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const root = document.querySelector('.cf-chat') as HTMLElement | null;
		const onResize = () => {
			const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			root?.style.setProperty('--cf-kb', `${offset}px`);
		};
		onResize();
		vv.addEventListener('resize', onResize);
		vv.addEventListener('scroll', onResize);
		return () => {
			vv.removeEventListener('resize', onResize);
			vv.removeEventListener('scroll', onResize);
		};
	}, []);

	const artifacts = extractArtifacts(chat.lastAssistant?.content ?? '');
	const extraTarget = useElementById(headerPortal?.extra);
	const actionsTarget = useElementById(headerPortal?.actions);
	const sourceCount = useMemo(() => {
		const hits = chat.lastAssistant?.hits?.length ?? 0;
		const citations = chat.lastAssistant?.citations?.length ?? 0;
		return hits + citations;
	}, [chat.lastAssistant]);

	const showSidebar =
		!showHostedHistory && (!drawerSidebar || chat.sidebarOpen);

	return (
		<div
			className={cn(
				'cf-chat cf-chat-shell',
				!embedded && chat.resolvedTheme === 'dark' && 'dark',
				className,
			)}
			data-theme={chat.resolvedTheme}>
			<a
				href='#cf-composer'
				className='sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-(--cf-bg-elevated) focus:px-3 focus:py-2'>
				Skip to composer
			</a>

			{showSidebar ? (
				<ConversationSidebar
					conversations={chat.conversations}
					activeId={chat.activeId}
					loading={chat.listLoading}
					loadingMore={chat.listLoadingMore}
					query={chat.listQuery}
					onQuery={chat.setListQuery}
					onOpen={(id) => {
						void chat.openConversation(id);
						if (drawerSidebar) chat.setSidebarOpen(false);
					}}
					onNew={chat.newChat}
					onRename={(id, title) => void chat.renameConversation(id, title)}
					onDelete={(id) => void chat.deleteConversation(id)}
					onLoadMore={chat.loadMore}
					hasMore={Boolean(chat.nextCursor)}
					collapsed={!drawerSidebar && chat.sidebarCollapsed}
					onToggleCollapsed={() =>
						drawerSidebar
							? chat.setSidebarOpen(false)
							: chat.setSidebarCollapsed((value) => !value)
					}
					mobile={drawerSidebar && chat.sidebarOpen}
					onCloseMobile={() => chat.setSidebarOpen(false)}
					theme={chat.theme}
					onTheme={chat.setTheme}
					enterSends={chat.enterSends}
					onEnterSends={chat.setEnterSends}
					showTheme={!embedded}
				/>
			) : null}

			<div
				className='relative flex min-h-0 min-w-0 flex-1 flex-col'
				style={{ paddingBottom: 'var(--cf-kb, 0px)' }}>
				{headerPortal ? (
					<>
						{extraTarget
							? createPortal(
									<ContextChip
										organizationName={organizationName}
										siteOptions={siteOptions}
										siteId={siteId}
										onSite={chooseSite}
										profileHref={profileHref}
										tourTarget
									/>,
									extraTarget,
								)
							: null}
						{actionsTarget
							? createPortal(
									<ChatToolButtons
										modes={modes}
										mode={chat.mode}
										onMode={chat.setMode}
										pending={chat.pending}
										showSources={showSources}
										sourcesOpen={sourcesOpen}
										sourceCount={sourceCount}
										onSources={() => setSourcesOpen((value) => !value)}
										onExport={() => chat.exportActive('markdown')}
										artifactOpen={chat.artifactOpen}
										artifactCount={artifacts.length}
										onArtifacts={() => chat.setArtifactOpen((value) => !value)}
									/>,
									actionsTarget,
								)
							: null}
					</>
				) : (
					<header className='shrink-0 border-b border-(--cf-border)'>
						<div
							className={cn(GUTTER, 'flex h-14 flex-row items-center gap-2')}>
							{!showHostedHistory &&
							(drawerSidebar || chat.sidebarCollapsed) ? (
								<IconButton
									label='Open conversations'
									onClick={() =>
										drawerSidebar
											? chat.setSidebarOpen(true)
											: chat.setSidebarCollapsed(false)
									}>
									<PanelLeft className='size-4' />
								</IconButton>
							) : null}

							{!embedded ? (
								<div id={titleId} className='min-w-0 flex-1'>
									{eyebrow ? (
										<p className='text-[11px] font-medium tracking-[0.16em] text-(--cf-accent-text) uppercase'>
											{eyebrow}
										</p>
									) : null}
									<h1 className='font-heading truncate text-base font-medium tracking-tight'>
										{title}
									</h1>
								</div>
							) : (
								<ContextChip
									organizationName={organizationName}
									siteOptions={siteOptions}
									siteId={siteId}
									onSite={chooseSite}
									profileHref={profileHref}
									titleId={titleId}
								/>
							)}

							<div className='ml-auto flex shrink-0 items-center gap-0.5'>
								<ChatToolButtons
									modes={modes}
									mode={chat.mode}
									onMode={chat.setMode}
									pending={chat.pending}
									showSources={showSources}
									sourcesOpen={sourcesOpen}
									sourceCount={sourceCount}
									onSources={() => setSourcesOpen((value) => !value)}
									onExport={() => chat.exportActive('markdown')}
									artifactOpen={chat.artifactOpen}
									artifactCount={artifacts.length}
									onArtifacts={() => chat.setArtifactOpen((value) => !value)}
								/>
							</div>
						</div>
					</header>
				)}

				<OfflineBanner
					show={chat.offline}
					message={chat.banner ?? chat.loadError}
				/>

				<div className='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
					<ThreadView
						path={chat.path}
						tree={chat.messages}
						emptyTitle={emptyTitle}
						emptyBody={emptyBody}
						emptyGreeting={emptyGreeting}
						emptyFeatures={emptyFeatures}
						emptyBlobLines={emptyBlobLines}
						onSelectBranch={(id) => void chat.selectBranch(id)}
						onCycleBranch={chat.cycleBranch}
						onEdit={chat.editAndResubmit}
						onRegenerate={chat.regenerate}
						onRetry={chat.retry}
						onDelete={(id) => void chat.deleteMessage(id)}
						onFeedback={chat.setFeedback}
						criterionHref={criterionHref}
					/>

					<div
						className={cn(
							COLUMN,
							'shrink-0 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
						)}>
						{chat.path.length === 0 ? (
							<SuggestionPills
								suggestions={suggestions}
								onPick={(value) => chat.send(value)}
							/>
						) : null}
						{!embedded && (organizationName || siteOptions?.length) ? (
							<div className='mb-2'>
								<ContextChip
									organizationName={organizationName}
									siteOptions={siteOptions}
									siteId={siteId}
									onSite={chooseSite}
									profileHref={profileHref}
								/>
							</div>
						) : null}
						<div id='cf-composer'>
							<Composer
								draft={chat.draft}
								onChange={chat.setDraft}
								onSend={() => chat.send()}
								onStop={chat.stop}
								pending={chat.streaming}
								enterSends={chat.enterSends}
								attachments={chat.attachments}
								onRemoveAttachment={(id) =>
									chat.setAttachments((files) =>
										files.filter((file) => file.id !== id),
									)
								}
								onFiles={(files) => void chat.addFiles(files)}
								placeholder={placeholder}
								version={chat.version}
								versionOptions={versionOptions}
								onVersion={chat.setVersion}
								kind={chat.kind}
								kindOptions={showKindFilter ? kindOptions : undefined}
								onKind={chat.setKind}
								models={models}
								modelId={modelId}
								onModel={setModelId}
								disabled={chat.overLimit}
							/>
						</div>
						<p className='mt-2 text-center text-[11px] text-(--cf-fg-subtle)'>
							{footer}
						</p>
					</div>

					{showSources && sourcesOpen ? (
						<div className='absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] flex-col border-l border-(--cf-border) bg-(--cf-bg-elevated) shadow-(--cf-shadow)'>
							<SourcesRail
								hits={chat.lastAssistant?.hits ?? []}
								citations={chat.lastAssistant?.citations ?? []}
								loading={
									chat.lastAssistant?.status === 'pending' ||
									chat.lastAssistant?.status === 'streaming'
								}
								criterionHref={criterionHref}
								onClose={() => setSourcesOpen(false)}
							/>
						</div>
					) : null}

					<ArtifactsPanel
						markdown={chat.lastAssistant?.content ?? ''}
						open={chat.artifactOpen}
						onClose={() => chat.setArtifactOpen(false)}
						mobile={mobile}
					/>
				</div>
			</div>
		</div>
	);
}

function useElementById(id: string | undefined) {
	const [node, setNode] = useState<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (!id) {
			setNode(null);
			return;
		}
		setNode(document.getElementById(id));
	}, [id]);
	return node;
}

function ChatToolButtons({
	modes,
	mode,
	onMode,
	pending,
	showSources,
	sourcesOpen,
	sourceCount,
	onSources,
	onExport,
	artifactOpen,
	artifactCount,
	onArtifacts,
}: {
	modes: ChatMode[];
	mode: ChatMode;
	onMode: (mode: ChatMode) => void;
	pending: boolean;
	showSources: boolean;
	sourcesOpen: boolean;
	sourceCount: number;
	onSources: () => void;
	onExport: () => void;
	artifactOpen: boolean;
	artifactCount: number;
	onArtifacts: () => void;
}) {
	return (
		<>
			{modes.length > 1 ? (
				<ModeSwitch
					mode={mode}
					onChange={onMode}
					disabled={pending}
					modes={modes}
				/>
			) : null}
			{showSources ? (
				<IconButton
					label={sourcesOpen ? 'Hide sources' : 'Show sources'}
					onClick={onSources}
					className={
						sourcesOpen || sourceCount > 0
							? 'overflow-visible text-(--cf-accent-text)'
							: 'overflow-visible'
					}>
					<span className='relative inline-flex'>
						<BookOpen className='size-4' />
						{sourceCount > 0 ? (
							<span
								className='absolute -top-1.5 -right-2.5 z-10 inline-flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ring-2 ring-card'
								style={{
									backgroundColor: 'var(--cf-accent, var(--brand, #9ae19d))',
									color: 'var(--cf-accent-fg, #121412)',
								}}>
								{sourceCount}
							</span>
						) : null}
					</span>
				</IconButton>
			) : null}
			<IconButton label='Export chat' onClick={onExport}>
				<Download className='size-4' />
			</IconButton>
			<IconButton
				label={artifactOpen ? 'Hide artifacts' : 'Show artifacts'}
				onClick={onArtifacts}
				className={artifactCount > 0 ? 'text-(--cf-accent-text)' : undefined}>
				<FileCode2 className='size-4' />
			</IconButton>
		</>
	);
}

function ContextChip({
	organizationName,
	siteOptions,
	siteId,
	onSite,
	profileHref,
	titleId,
	tourTarget,
}: {
	organizationName?: string;
	siteOptions?: SelectOption[];
	siteId: string;
	onSite: (value: string) => void;
	profileHref?: string;
	titleId?: string;
	tourTarget?: boolean;
}) {
	if (!organizationName && !siteOptions?.length) {
		if (!profileHref) return <div id={titleId} className='min-w-0 flex-1' />;
		return (
			<p
				id={titleId}
				className='min-w-0 flex-1 truncate text-xs text-(--cf-fg-muted)'>
				No company yet.{' '}
				<a
					href={profileHref}
					className='font-medium text-(--cf-accent-text) underline-offset-2 hover:underline'>
					Create one
				</a>
			</p>
		);
	}

	return (
		<div id={titleId} className='flex min-w-0 items-center'>
			<div
				id={tourTarget ? 'tour-site' : undefined}
				className='inline-flex min-w-0 max-w-full items-center rounded-full bg-(--cf-bg-muted)/70 py-0.5 pr-1 pl-3'>
				{organizationName ? (
					<span className='hidden min-w-0 truncate text-xs text-(--cf-fg-muted) sm:inline'>
						{organizationName}
					</span>
				) : null}
				{organizationName && siteOptions && siteOptions.length > 0 ? (
					<span
						className='hidden px-1.5 text-(--cf-fg-subtle) sm:inline'
						aria-hidden>
						·
					</span>
				) : null}
				{siteOptions && siteOptions.length > 0 ? (
					<MenuSelect
						label='Site in context'
						value={siteId || siteOptions[0]!.value}
						options={siteOptions}
						onChange={onSite}
						className='max-w-52'
					/>
				) : profileHref ? (
					<a
						href={profileHref}
						className='truncate py-1.5 pr-2 text-xs text-(--cf-fg-muted) hover:text-(--cf-fg)'>
						Add a site
					</a>
				) : null}
			</div>
		</div>
	);
}

function ModeSwitch({
	mode,
	onChange,
	disabled,
	modes,
}: {
	mode: ChatMode;
	onChange: (mode: ChatMode) => void;
	disabled?: boolean;
	modes: ChatMode[];
}) {
	return (
		<div
			className='flex rounded-full bg-(--cf-bg-muted) p-0.5 text-xs font-medium'
			role='tablist'
			aria-label='Response mode'>
			{modes.map((item) => (
				<button
					key={item}
					type='button'
					role='tab'
					aria-selected={mode === item}
					disabled={disabled}
					onClick={() => onChange(item)}
					className={cn(
						'rounded-full px-3 py-1 capitalize transition-colors',
						mode === item
							? 'bg-(--cf-bg-elevated) text-(--cf-fg) shadow-sm'
							: 'text-(--cf-fg-muted)',
					)}>
					{item}
				</button>
			))}
		</div>
	);
}
