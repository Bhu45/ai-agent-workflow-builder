export const SUBSCRIBE_WORKFLOW_RUN = `
  subscription SubscribeWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      error
      started_at
      completed_at
      step_runs(order_by: { started_at: asc }) {
        id
        status
        output
        error
        started_at
        completed_at
        workflow_step_id
        workflow_step {
          position
          type
        }
      }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUNS_BY_WORKFLOW = `
  subscription SubscribeWorkflowRunsByWorkflow($workflowId: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } },
      order_by: { started_at: desc },
      limit: 10
    ) {
      id
      status
      started_at
      completed_at
    }
  }
`;
