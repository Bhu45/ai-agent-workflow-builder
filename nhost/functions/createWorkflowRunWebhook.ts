import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { workflowId } = req.body;
  if (!workflowId) return res.status(400).json({ error: 'Missing required fields' });

  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const mutation = `
    mutation CreateRun($workflowId: uuid!) {
      insert_workflow_runs_one(object: { workflow_id: $workflowId, status: "running", started_at: "now()" }) {
        id
      }
    }
  `;

  try {
    const data: any = await client.request(mutation, { workflowId });
    return res.status(200).json({ runId: data.insert_workflow_runs_one?.id });
  } catch (err: any) {
    if (err.response && err.response.errors) {
      console.error('[createWorkflowRunWebhook.ts] GraphQL Error:', JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error('[createWorkflowRunWebhook.ts] Execution Error:', err.message || err);
    }
    return res.status(500).json({ error: 'Database execution failed' });
  }
};
