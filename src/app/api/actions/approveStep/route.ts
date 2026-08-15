import { NextResponse } from 'next/server';
import { resumeWorkflow } from '@/workflow-engine/engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Authenticate Request from Hasura
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.APP_ACTION_SECRET) {
      return NextResponse.json(
        { message: 'Unable to approve step. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }

    // 2. Extract Payload
    const userId = body.session_variables?.['x-hasura-user-id'];
    const runId = body.input?.workflow_run_id;
    const approved = body.input?.approved ?? false;

    if (!userId) {
      return NextResponse.json(
        { message: 'Unable to approve step. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }

    if (!runId) {
      return NextResponse.json(
        { message: 'Workflow Run ID is required.', extensions: { code: 'BAD_REQUEST' } },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization');

    console.log(`[Action] approveStep called for run ${runId} by user ${userId}. Approved: ${approved}`);

    const result = await resumeWorkflow(runId, userId, approved, authHeader);

    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
    });

  } catch (error: any) {
    console.error('[Action] Error in approveStep:', error.message || error);
    return NextResponse.json(
      { message: error.message || 'Unable to approve step. Please try again.', extensions: { code: 'INTERNAL_ERROR' } },
      { status: 400 }
    );
  }
}
