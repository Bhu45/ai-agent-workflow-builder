import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== 'Bearer ' + process.env.APP_ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { runId, stepId, input } = req.body;
  if (!runId || !stepId || input === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(500).json({ error: 'Server misconfiguration: NHOST_ADMIN_SECRET missing' });
  }

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const mutation = `
    mutation CreateStepRun($runId: uuid!, $stepId: uuid!, $input: jsonb!) {
      insert_step_runs_one(object: {
        workflow_run_id: $runId,
        workflow_step_id: $stepId,
        status: "running",
        input: $input,
        started_at: "now()"
      }) { id }
    }
  `;

  try {
    console.log(`[createStepRun] runId=${runId} stepId=${stepId}`);
    const data: any = await client.request(mutation, { runId, stepId, input });
    return res.status(200).json({ id: data.insert_step_runs_one.id });
  } catch (err: any) {
    if (err.response && err.response.errors) {
      console.error('[createStepRun.ts] GraphQL Error:', JSON.stringify(err.response.errors, null, 2));
      return res.status(500).json({ 
        error: 'Database execution failed',
        details: err.response.errors
      });
    } else {
      console.error('[createStepRun.ts] Execution Error:', err.message || err);
      return res.status(500).json({ error: 'Database execution failed' });
    }
  }
};
