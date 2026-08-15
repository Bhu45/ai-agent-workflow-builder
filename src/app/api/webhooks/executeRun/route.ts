import { NextResponse } from 'next/server';
import { executeWorkflowFromRun } from '@/workflow-engine/engine';

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
    
    // Execute async using the background executor
    // (We don't await because Event Triggers will time out if LLM takes too long, wait...)
    // Actually, Event Triggers have retry mechanisms and timeouts. The webhook uses maxDuration = 60
    // so we CAN await it!
    const initialInput = run.input || {};
    const triggeredBy = run.triggered_by ?? null;
    const result = await executeWorkflowFromRun(run.id, run.workflow_id, initialInput, triggeredBy);
    
    return NextResponse.json({ status: 'ok', result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
