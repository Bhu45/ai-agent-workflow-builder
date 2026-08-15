/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLClient } from 'graphql-request';

const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
  : 'http://localhost:8080/v1/graphql';

const NHOST_FUNCTIONS_URL = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.functions.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
  : 'http://localhost:1337/v1/functions';

async function callNhostFunction(functionName: string, payload: any) {
  const url = `${NHOST_FUNCTIONS_URL}/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.APP_ACTION_SECRET}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Nhost Function ${functionName}] Error:`, text);
    throw new Error(`Failed to call ${functionName}: ${res.statusText}`);
  }
  return res.json();
}

// Client configured to impersonate a specific user (Leveraging Hasura Layer 1 RLS)
// Note: This relies on the forwarded Authorization: Bearer token from Hasura Actions.
export const getUserGraphQLClient = (authHeader: string | null) => {
  return new GraphQLClient(endpoint, {
    headers: authHeader ? { authorization: authHeader } : {},
  });
};

export async function fetchWorkflowAsUser(workflowId: string, authHeader: string | null) {
  const query = `
    query GetWorkflowForExecution($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        org_id
        organization {
          id
          quota_limit
          quota_used
          org_members {
            role
            user_id
          }
        }
        workflow_steps(order_by: { position: asc }) {
          id
          position
          type
          config
        }
      }
    }
  `;
  const client = getUserGraphQLClient(authHeader);
  const data: any = await client.request(query, { id: workflowId });
  return data.workflows_by_pk;
}

export async function checkQuota(orgId: string, authHeader: string | null): Promise<boolean> {
  const query = `
    query CheckQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        quota_used
        quota_limit
      }
    }
  `;
  // The user role has read access to organizations
  const client = getUserGraphQLClient(authHeader);
  const data: any = await client.request(query, { orgId });
  if (!data.organizations_by_pk) return false;
  return data.organizations_by_pk.quota_used < data.organizations_by_pk.quota_limit;
}

export async function incrementQuota(orgId: string): Promise<boolean> {
  const res = await callNhostFunction('incrementQuota', { orgId });
  return res.success;
}

export async function createWorkflowRun(workflowId: string, authHeader: string | null) {
  // Use native Hasura insert mutation relying on Row-Level Security permissions
  const mutation = `
    mutation TriggerWorkflowRun($workflowId: uuid!) {
      insert_workflow_runs_one(
        object: {
          workflow_id: $workflowId
        }
      ) {
        id
        status
      }
    }
  `;
  const client = getUserGraphQLClient(authHeader);
  const data: any = await client.request(mutation, { workflowId });
  return data.insert_workflow_runs_one.id;
}

export async function createWorkflowRunWebhook(workflowId: string) {
  const res = await callNhostFunction('createWorkflowRunWebhook', { workflowId });
  return res.runId;
}

export async function updateWorkflowRunStatus(runId: string, status: string, error?: string) {
  await callNhostFunction('updateWorkflowRunStatus', { runId, status, error });
}

export async function createStepRun(runId: string, stepId: string, input: any) {
  const res = await callNhostFunction('createStepRun', { runId, stepId, input });
  return res.id;
}

export async function updateStepRunStatus(stepRunId: string, status: string, output?: any, error?: string) {
  await callNhostFunction('updateStepRun', { stepRunId, status, output, error });
}

export async function internalDbWrite(orgId: string, runId: string, dataObj: any) {
  await callNhostFunction('internalDbWrite', { orgId, runId, data: dataObj });
}

export async function getWorkflowRunAsUser(runId: string, authHeader: string | null) {
  const query = `
    query GetRun($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) {
        id
        status
        workflow {
          id
          org_id
          organization {
            id
            org_members {
              role
              user_id
            }
          }
          workflow_steps(order_by: { position: asc }) {
            id
            position
            type
            config
          }
        }
        step_runs(order_by: { created_at: desc }, limit: 1) {
          id
          status
          output
          workflow_step_id
        }
      }
    }
  `;
  const client = getUserGraphQLClient(authHeader);
  const data: any = await client.request(query, { runId });
  return data.workflow_runs_by_pk;
}

export async function getWebhookTriggerConfig(workflowId: string) {
  // Webhook executor doesn't have user JWT. Using Nhost Function to fetch config.
  // Actually, I can just create another Nhost function or use fetchWorkflowAsAdmin.
  // Let's create `getWebhookTriggerConfig` Nhost function.
  const res = await callNhostFunction('getWebhookTriggerConfig', { workflowId });
  return res;
}

export async function fetchWorkflowAsAdmin(workflowId: string) {
  const res = await callNhostFunction('fetchWorkflowAsAdmin', { workflowId });
  return res;
}

export async function atomicResumeWorkflow(runId: string, stepRunId: string, userId: string, approved: boolean) {
  const res = await callNhostFunction('atomicResumeWorkflow', { runId, stepRunId, userId, approved });
  return res;
}
