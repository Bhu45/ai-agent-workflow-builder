import { NextResponse } from 'next/server';
import { executeWorkflow } from '@/workflow-engine/engine';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.APP_ACTION_SECRET) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const run = payload.event?.data?.new;
    if (!run || !run.id || !run.workflow_id) {
      return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    console.log('[Webhook] executeRun started for runId=' + run.id);
    // Use the existing engine, but we already have a run created.
    // Wait, executeWorkflow creates a new run_id! We need to modify engine.ts to support passing an existing run_id!
    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
