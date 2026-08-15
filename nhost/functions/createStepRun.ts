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

  const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
    ? 'https://' + process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN + '.graphql.' + process.env.NEXT_PUBLIC_NHOST_REGION + '.nhost.run/v1'
    : 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(500).json({ error: 'Server misconfiguration: NHOST_ADMIN_SECRET missing' });
  }

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const mutation = `n    mutation CreateStepRun($runId: uuid!, $stepId: uuid!, $input: jsonb!) {
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
    const data: any = await client.request(mutation, { runId, stepId, input });
    return res.status(200).json({ id: data.insert_step_runs_one.id });
  } catch (error: any) {
    console.error('Error creating step run:', error.message || error);
    return res.status(500).json({ error: 'Database execution failed' });
  }
};
