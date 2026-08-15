export const GET_WORKFLOWS_BY_ORG = `
  query GetWorkflowsByOrg($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      created_at
      workflow_triggers {
        id
        type
        enabled
      }
      workflow_steps(order_by: { position: asc }) {
        id
        position
        type
        config
      }
      workflow_runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW_BY_ID = `
  query GetWorkflowById($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      description
      workflow_triggers {
        id
        type
        config
        enabled
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

export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(object: { org_id: $orgId, name: $name, description: $description }) {
      id
      name
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $name: String!, $description: String) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description }) {
      id
    }
  }
`;

// Simple approach: delete existing steps and insert new ones to handle reordering easily
export const REPLACE_WORKFLOW_STEPS = `
  mutation ReplaceWorkflowSteps($workflowId: uuid!, $steps: [workflow_steps_insert_input!]!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      affected_rows
    }
  }
`;

export const UPSERT_WORKFLOW_TRIGGER = `
  mutation UpsertWorkflowTrigger($workflowId: uuid!, $type: String!, $config: jsonb!, $enabled: Boolean!) {
    insert_workflow_triggers_one(
      object: { workflow_id: $workflowId, type: $type, config: $config, enabled: $enabled },
      on_conflict: { constraint: workflow_triggers_pkey, update_columns: [type, config, enabled] }
    ) {
      id
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun($workflow_id: uuid!, $initial_input: jsonb) {
    triggerWorkflowRun(
      workflow_id: $workflow_id,
      initial_input: $initial_input
    ) {
      run_id
      status
    }
  }
`;
