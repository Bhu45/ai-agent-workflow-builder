# Final Assignment Write-Up

## Schema Reasoning
The workflow system relies on a heavily normalized Postgres schema secured by Hasura's Role-Based Access Control (RBAC). The core entities are isolated by a robust multi-tenant model mapped to an `organizations` table. `org_members` associates the user `X-Hasura-User-Id` and their specific role (`owner`, `editor`, `viewer`) to an organization. By injecting the user ID securely via session variables, Hasura ensures that a user can only access rows connected to an organization they belong to.

## Layer 1: Organization + Role Scoping
Hasura handles all Layer 1 authorization at the database level. Permissions on `workflows`, `workflow_steps`, `workflow_triggers`, `workflow_runs`, and `step_runs` enforce a chain of foreign key relations that terminate at `org_members`. If a user from Org B attempts to read or mutate any data belonging to Org A, the GraphQL engine rejects it seamlessly, preventing any cross-tenant leakage.

## Layer 2: Step-Level Gating
Beyond basic row access, the assignment requires nuanced permission logic for the `editor` role, preventing them from modifying critical pipeline operations (`db_write`, `notify`, `workflow_triggers`). This is implemented with composite Boolean expressions in the Hasura metadata. `editor`s can only operate on harmless steps (`llm_call`, `http_request`, `conditional_branch`, `approval_gate`). `owner`s are unconstrained. The execution engine mirrors this check dynamically at runtime, verifying the identity of the user that initiated the workflow run (the `triggered_by` field) before permitting the step to execute.

## triggerWorkflowRun Flow
The `triggerWorkflowRun` Next.js serverless route acts as a security facade for launching runs. It receives a GraphQL request forwarded by Hasura Actions, verifying the `X-Hasura-Admin-Secret` securely. The function verifies user presence, looks up the target organization, and checks the organization's quota synchronously. If the user exceeds their quota, the run is blocked immediately. Otherwise, the run is recorded into the database and tagged with the user's ID (`triggered_by`). Hasura's asynchronous Event Triggers then dispatch the payload securely into the background worker queue (`executeRun`).

## Approval-Gate Pause/Resume
The engine halts workflow execution when it encounters an `approval_gate`, updating the `status` fields to `paused` for both the `step_run` and the overall `workflow_run`. An owner or editor can subsequently trigger the `approveStep` action. The backend strictly authenticates this resume action through an atomic Nhost operation (`atomicResumeWorkflow`). This ensures only one process successfully mutates the state from `paused` to `completed`, thwarting race conditions. If approved, the engine spawns and executes the subsequent steps.

## Cross-Org Isolation
Isolation is enforced across all API routes, engine executions, and client queries using a combination of strictly propagated Hasura Identity Headers, and verified Nhost functions. For instance, `checkQuota` leverages Hasura's native client, configured to impersonate the user triggering the run. A malicious user tampering with IDs receives `null` return values since the GraphQL layer obscures out-of-scope rows. For backend executions like Webhooks, the execution engine drops user context, runs as an admin, but rejects `notify` or `db_write` executions since they lack an explicit `triggered_by` trusted context belonging to an `owner`.

## Retry Handling
Hasura Event Triggers natively support automated backoff and retry behavior. Webhooks and internal notifications queue up inside Hasura's event queue and execute according to specific timeout conditions. If an endpoint is temporarily degraded or the LLM is overloaded, the Event Trigger backs off and retries up to the configured limit without dropping execution state.

## Quota Enforcement
Quota verification occurs immediately before instantiating a workflow run (a strict `check-before-run` model). The system compares the usage against the explicit limit. However, the actual quota deduction logic operates as a distinct atomic database operation after a workflow completes successfully (`incrementQuota`). Crucially, if the accounting phase of the workflow fails due to transient database locks or collisions, the execution is not treated as a failure; it logs a warning but finalizes the workflow state as `completed`, ensuring high availability for critical business logic.
