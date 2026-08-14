import { NextResponse } from 'next/server';
import { executeWorkflow } from '@/workflow-engine/engine';

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
    const workflowId = body.input?.workflow_id;
    const initialInput = body.input?.initial_input || {};

    // 2. Validate Inputs
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized: Missing x-hasura-user-id' }, { status: 401 });
    }

    if (!workflowId) {
      return NextResponse.json({ message: 'Bad Request: Missing workflow_id' }, { status: 400 });
    }

    // 3. Execute Workflow Engine
    // Note: For long-running workflows, this would typically enqueue a job 
    // and return immediately, but since this is a simple linear engine for this assignment,
    // we execute it synchronously (or at least start it).
    // The assignment says "triggerWorkflowRun Action" - if it blocks Vercel's 10s limit,
    // we could spawn it without awaiting, but Hasura Action expects a response.
    // We will await it for simplicity, assuming fast LLM responses, or just return the runId immediately and let it process in background.
    // The requirement says: "Create a workflow_run before executing steps." 
    // Hasura Actions can be async. We will just start it and return a message. But Node on Vercel 
    // might kill background promises. 
    // To be safe for Vercel, we'll await it, unless we reach timeout limits.

    console.log(`[Action] triggerWorkflowRun called for workflow ${workflowId} by user ${userId}`);

    const result = await executeWorkflow(workflowId, { type: 'user', userId }, initialInput);

    // Hasura Custom Action response matches the GraphQL output type we define in Hasura.
    // E.g., type TriggerWorkflowRunOutput { run_id: uuid!, status: String! }
    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
    });

  } catch (error: unknown) {
    console.error('[Action] Error in triggerWorkflowRun:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message: message || 'Internal Server Error' }, { status: 400 });
  }
}
