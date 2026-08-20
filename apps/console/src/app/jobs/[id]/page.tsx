import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

interface JobDetail {
	job: {
		id: string;
		runId: string;
		stage: string;
		status: string;
		stats: Record<string, unknown>;
		error: string | null;
		errorStack: string | null;
		durationMs: number | null;
		startedAt: string | null;
		finishedAt: string | null;
		versionCode: string | null;
	};
	events: Array<{
		id: string;
		level: string;
		message: string;
		payload: Record<string, unknown> | null;
		createdAt: string;
	}>;
}

export default async function JobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const data = await api<JobDetail>(`/jobs/${id}`);

	return (
		<div className='space-y-6'>
			<div>
				<p className='font-mono text-xs uppercase tracking-widest text-muted-foreground'>
					<Link href='/ingest' className='hover:underline'>
						Ingest
					</Link>
				</p>
				<h1 className='font-mono text-2xl font-medium'>{data.job.stage}</h1>
				<div className='mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
					<Badge
						variant={
							data.job.status === 'failed' ? 'destructive' : 'secondary'
						}>
						{data.job.status}
					</Badge>
					{data.job.versionCode}
					{data.job.durationMs != null ? ` · ${data.job.durationMs}ms` : null}
				</div>
			</div>
			{data.job.error ? (
				<p className='text-sm text-destructive'>{data.job.error}</p>
			) : null}
			{Object.keys(data.job.stats ?? {}).length > 0 ? (
				<pre className='max-w-full min-w-0 overflow-x-hidden whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs'>
					{JSON.stringify(data.job.stats, null, 2)}
				</pre>
			) : null}
			<div>
				{data.events.map((event) => (
					<div key={event.id}>
						<Separator />
						<p className='min-w-0 py-2 font-mono text-xs wrap-anywhere'>
							<span className='text-muted-foreground'>
								{event.level.padEnd(5)}{' '}
							</span>
							{event.message}
							{event.payload ? (
								<span className='text-muted-foreground'>
									{' '}
									{JSON.stringify(event.payload)}
								</span>
							) : null}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
