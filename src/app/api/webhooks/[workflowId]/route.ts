import { NextResponse } from 'next/server';
// We don't import executeWorkflow here anymore
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getWebhookTriggerConfig, createWorkflowRunWebhook } = require('@/workflow-engine/api');

export async function POST(
  req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    
    // 1. Authenticate via Bearer Token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    // 2. Fetch Webhook Trigger Config for this Workflow
    const trigger = await getWebhookTriggerConfig(workflowId);
    if (!trigger) {
      return NextResponse.json({ message: 'Webhook trigger not found or disabled' }, { status: 404 });
    }

    // 3. Verify Secret
    const expectedSecret = trigger.config?.secret;
    if (!expectedSecret || token !== expectedSecret) {
      return NextResponse.json({ message: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    // 4. Determine execution context without user impersonation
    const orgId = trigger.workflow.organization.id;
    if (!orgId) {
      return NextResponse.json({ message: 'No valid organization found for this workflow' }, { status: 500 });
    }

    // 5. Parse Input
    let initialInput = {};
    try {
      initialInput = await req.json();
    } catch {
      // Ignore if no JSON body
    }

    // 6. Execute Workflow
    console.log(`[Webhook] Triggering workflow ${workflowId} for org ${orgId}`);
    
    // We just create the run. The execution is handled asynchronously by the Event Trigger.
    const runId = await createWorkflowRunWebhook(workflowId, initialInput);

    return NextResponse.json({
      run_id: runId,
      status: 'running',
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Webhook] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message: message || 'Internal Server Error' }, { status: 500 });
  }
}
