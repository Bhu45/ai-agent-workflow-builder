import { NextResponse } from 'next/server';
import { resumeWorkflow } from '@/workflow-engine/engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Authenticate Request from Hasura
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.NHOST_ACTION_SECRET) {
      return NextResponse.json({ message: 'Unauthorized: Invalid action secret' }, { status: 401 });
    }

    // 2. Extract Hasura Action Payload
    const userId = body.session_variables?.['x-hasura-user-id'];
    const runId = body.input?.workflow_run_id;
    const approved = body.input?.approved ?? false;

    // 2. Validate Inputs
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized: Missing x-hasura-user-id' }, { status: 401 });
    }

    if (!runId) {
      return NextResponse.json({ message: 'Bad Request: Missing workflow_run_id' }, { status: 400 });
    }

    // 3. Resume Workflow Engine
    console.log(`[Action] approveStep called for run ${runId} by user ${userId}. Approved: ${approved}`);

    const result = await resumeWorkflow(runId, userId, approved);

    // Hasura Custom Action response matches the GraphQL output type we define in Hasura.
    // E.g., type ApproveStepOutput { run_id: uuid!, status: String! }
    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
    });

  } catch (error: unknown) {
    console.error('[Action] Error in approveStep:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message: message || 'Internal Server Error' }, { status: 400 });
  }
}
