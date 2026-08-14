/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLClient } from 'graphql-request';

const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
  : 'http://localhost:8080/v1/graphql';

const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

// Admin client for backend-only updates
export const adminGraphQLClient = new GraphQLClient(endpoint, {
  headers: {
    'x-hasura-admin-secret': adminSecret,
  },
});

// Client configured to impersonate a specific user (Leveraging Hasura Layer 1 RLS)
export const getUserGraphQLClient = (userId: string) => {
  return new GraphQLClient(endpoint, {
    headers: {
      'x-hasura-admin-secret': adminSecret,
      'x-hasura-role': 'user',
      'x-hasura-user-id': userId,
    },
  });
};

export async function fetchWorkflowAsUser(workflowId: string, userId: string) {
  const query = `
    query GetWorkflowForExecution($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        org_id
        organization {
          id
          quota_limit
          quota_used
          org_members(where: { user_id: { _eq: $userId } }) {
            role
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
  const client = getUserGraphQLClient(userId);
  const data: any = await client.request(query, { id: workflowId });
  return data.workflows_by_pk;
}

export async function checkQuota(orgId: string): Promise<boolean> {
  const query = `
    query CheckQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        quota_used
        quota_limit
      }
    }
  `;
  const data: any = await adminGraphQLClient.request(query, { orgId });
  if (!data.organizations_by_pk) return false;
  return data.organizations_by_pk.quota_used < data.organizations_by_pk.quota_limit;
}

export async function incrementQuota(orgId: string): Promise<boolean> {
  const mutation = `
    mutation IncrementQuota($orgId: uuid!) {
      update_organizations(
        where: { id: { _eq: $orgId }, quota_used: { _lt: quota_limit } },
        _inc: { quota_used: 1 }
      ) {
        affected_rows
      }
    }
  `;
  const data: any = await adminGraphQLClient.request(mutation, { orgId });
  return data.update_organizations.affected_rows > 0;
}

export async function createWorkflowRun(workflowId: string) {
  const mutation = `
    mutation CreateRun($workflowId: uuid!) {
      insert_workflow_runs_one(object: { workflow_id: $workflowId, status: "running", started_at: "now()" }) {
        id
      }
    }
  `;
  const data: any = await adminGraphQLClient.request(mutation, { workflowId });
  return data.insert_workflow_runs_one.id;
}

export async function updateWorkflowRunStatus(runId: string, status: string, error?: string) {
  const mutation = `
    mutation UpdateRun($runId: uuid!, $status: String!, $error: String) {
      update_workflow_runs_by_pk(
        pk_columns: { id: $runId },
        _set: { 
          status: $status, 
          error: $error,
          completed_at: ${status === 'completed' || status === 'failed' ? '"now()"' : 'null'}
        }
      ) { id }
    }
  `;
  await adminGraphQLClient.request(mutation, { runId, status, error });
}

export async function createStepRun(runId: string, stepId: string, input: any) {
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
  const data: any = await adminGraphQLClient.request(mutation, { runId, stepId, input });
  return data.insert_step_runs_one.id;
}

export async function updateStepRunStatus(stepRunId: string, status: string, output?: any, error?: string) {
  const mutation = `
    mutation UpdateStepRun($stepRunId: uuid!, $status: String!, $output: jsonb, $error: String) {
      update_step_runs_by_pk(
        pk_columns: { id: $stepRunId },
        _set: { 
          status: $status, 
          output: $output, 
          error: $error,
          completed_at: ${status === 'completed' || status === 'failed' || status === 'skipped' ? '"now()"' : 'null'}
        }
      ) { id }
    }
  `;
  await adminGraphQLClient.request(mutation, { stepRunId, status, output, error });
}

export async function internalDbWrite(orgId: string, runId: string, dataObj: any) {
  const mutation = `
    mutation InternalWrite($orgId: uuid!, $runId: uuid!, $data: jsonb!) {
      insert_internal_app_data_one(object: { org_id: $orgId, workflow_run_id: $runId, data: $data }) {
        id
      }
    }
  `;
  await adminGraphQLClient.request(mutation, { orgId, runId, data: dataObj });
}

export async function getWorkflowRunAsUser(runId: string, userId: string) {
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
            org_members(where: { user_id: { _eq: $userId } }) {
              role
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
  const client = getUserGraphQLClient(userId);
  const data: any = await client.request(query, { runId });
  return data.workflow_runs_by_pk;
}

export async function getWebhookTriggerConfig(workflowId: string) {
  const query = `
    query GetWebhookTrigger($workflowId: uuid!) {
      workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" }, enabled: { _eq: true } }) {
        id
        config
        workflow {
          organization {
            id
          }
        }
      }
    }
  `;
  const data: any = await adminGraphQLClient.request(query, { workflowId });
  return data.workflow_triggers[0];
}

export async function fetchWorkflowAsAdmin(workflowId: string) {
  const query = `
    query GetWorkflowForExecutionAdmin($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        org_id
        organization {
          id
          quota_limit
          quota_used
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
  const data: any = await adminGraphQLClient.request(query, { id: workflowId });
  return data.workflows_by_pk;
}

export async function atomicResumeWorkflow(runId: string, stepRunId: string, userId: string, approved: boolean) {
  const runStatus = approved ? "running" : "failed";
  const stepStatus = approved ? "completed" : "failed";
  const output = {
    approved,
    approved_by: userId,
    approved_at: new Date().toISOString()
  };

  const mutation = `
    mutation AtomicApprove(
      $runId: uuid!, 
      $stepRunId: uuid!, 
      $userId: uuid!, 
      $runStatus: String!, 
      $stepStatus: String!,
      $output: jsonb!
    ) {
      update_workflow_runs(
        where: { 
          id: { _eq: $runId }, 
          status: { _eq: "paused" },
          workflow: {
            organization: {
              org_members: {
                user_id: { _eq: $userId },
                role: { _in: ["owner", "editor"] }
              }
            }
          }
        },
        _set: { status: $runStatus }
      ) {
        affected_rows
      }
      
      update_step_runs(
        where: {
          id: { _eq: $stepRunId },
          status: { _eq: "paused" },
          workflow_step: { type: { _eq: "approval_gate" } }
        },
        _set: {
          status: $stepStatus,
          output: $output,
          completed_at: "now()"
        }
      ) {
        affected_rows
      }
    }
  `;
  const data: any = await adminGraphQLClient.request(mutation, {
    runId, stepRunId, userId, runStatus, stepStatus, output
  });

  return {
    runAffected: data.update_workflow_runs?.affected_rows || 0,
    stepAffected: data.update_step_runs?.affected_rows || 0
  };
}
