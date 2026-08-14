/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const METADATA_DIR = path.join(__dirname, '..', 'hasura', 'metadata');
const DATABASES_DIR = path.join(METADATA_DIR, 'databases');
const DEFAULT_DIR = path.join(DATABASES_DIR, 'default');
const TABLES_DIR = path.join(DEFAULT_DIR, 'tables');

// Ensure directories exist
[METADATA_DIR, DATABASES_DIR, DEFAULT_DIR, TABLES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// version.yaml
fs.writeFileSync(path.join(METADATA_DIR, 'version.yaml'), `version: 3\n`);

// databases/databases.yaml
fs.writeFileSync(path.join(DATABASES_DIR, 'databases.yaml'), `- name: default\n  kind: postgres\n  configuration:\n    connection_info:\n      database_url:\n        from_env: HASURA_GRAPHQL_DATABASE_URL\n      isolation_level: read-committed\n      use_prepared_statements: false\n  tables: "!include default/tables/tables.yaml"\n`);

// Tables array for tables.yaml
const tables = [
  'public_internal_app_data.yaml',
  'public_org_members.yaml',
  'public_organizations.yaml',
  'public_roles.yaml',
  'public_run_statuses.yaml',
  'public_step_runs.yaml',
  'public_workflow_runs.yaml',
  'public_workflow_steps.yaml',
  'public_workflow_triggers.yaml',
  'public_workflows.yaml'
];

fs.writeFileSync(path.join(TABLES_DIR, 'tables.yaml'), tables.map(t => `- "!include ${t}"\n`).join(''));

// A helper for common Select Permissions
// We rely on Hasura's built in X-Hasura-User-Id. 
// A user can read if they are a member of the organization.
const orgMemberSelectFilter = `
      filter:
        org_members:
          user_id:
            _eq: X-Hasura-User-Id`;

const orgMemberNestedSelectFilter = `
      filter:
        organization:
          org_members:
            user_id:
              _eq: X-Hasura-User-Id`;

const workflowNestedSelectFilter = `
      filter:
        workflow:
          organization:
            org_members:
              user_id:
                _eq: X-Hasura-User-Id`;
                
const workflowRunNestedSelectFilter = `
      filter:
        workflow_run:
          workflow:
            organization:
              org_members:
                user_id:
                  _eq: X-Hasura-User-Id`;

// public_organizations.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_organizations.yaml'), `table:
  name: organizations
  schema: public
array_relationships:
  - name: org_members
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: org_members
          schema: public
  - name: workflows
    using:
      foreign_key_constraint_on:
        column: org_id
        table:
          name: workflows
          schema: public
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - name
        - quota_limit
        - quota_used
        - quota_period_start
        - created_at
        - updated_at
${orgMemberSelectFilter}
`);

// public_org_members.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_org_members.yaml'), `table:
  name: org_members
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - org_id
        - user_id
        - role
        - created_at
${orgMemberNestedSelectFilter}
`);

// public_workflows.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_workflows.yaml'), `table:
  name: workflows
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
array_relationships:
  - name: workflow_steps
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_steps
          schema: public
  - name: workflow_triggers
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_triggers
          schema: public
  - name: workflow_runs
    using:
      foreign_key_constraint_on:
        column: workflow_id
        table:
          name: workflow_runs
          schema: public
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - org_id
        - name
        - description
        - created_at
        - updated_at
${orgMemberNestedSelectFilter}
insert_permissions:
  - role: user
    permission:
      check:
        organization:
          org_members:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - role:
                  _in: ["owner", "editor"]
      columns:
        - org_id
        - name
        - description
update_permissions:
  - role: user
    permission:
      columns:
        - name
        - description
      filter:
        organization:
          org_members:
            _and:
              - user_id:
                  _eq: X-Hasura-User-Id
              - role:
                  _in: ["owner", "editor"]
      check: null
`);

// public_workflow_steps.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_workflow_steps.yaml'), `table:
  name: workflow_steps
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - position
        - type
        - config
        - created_at
        - updated_at
${workflowNestedSelectFilter}
insert_permissions:
  - role: user
    permission:
      check:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
      columns:
        - workflow_id
        - position
        - type
        - config
update_permissions:
  - role: user
    permission:
      columns:
        - position
        - type
        - config
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
      check: null
delete_permissions:
  - role: user
    permission:
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
`);

// public_workflow_triggers.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_workflow_triggers.yaml'), `table:
  name: workflow_triggers
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - type
        - config
        - enabled
        - created_at
${workflowNestedSelectFilter}
insert_permissions:
  - role: user
    permission:
      check:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
      columns:
        - workflow_id
        - type
        - config
        - enabled
update_permissions:
  - role: user
    permission:
      columns:
        - type
        - config
        - enabled
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
      check: null
delete_permissions:
  - role: user
    permission:
      filter:
        workflow:
          organization:
            org_members:
              _and:
                - user_id:
                    _eq: X-Hasura-User-Id
                - role:
                    _in: ["owner", "editor"]
`);

// public_workflow_runs.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_workflow_runs.yaml'), `table:
  name: workflow_runs
  schema: public
object_relationships:
  - name: workflow
    using:
      foreign_key_constraint_on: workflow_id
array_relationships:
  - name: step_runs
    using:
      foreign_key_constraint_on:
        column: workflow_run_id
        table:
          name: step_runs
          schema: public
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_id
        - status
        - started_at
        - completed_at
        - error
        - created_at
${workflowNestedSelectFilter}
`);

// public_step_runs.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_step_runs.yaml'), `table:
  name: step_runs
  schema: public
object_relationships:
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
  - name: workflow_step
    using:
      foreign_key_constraint_on: workflow_step_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - workflow_run_id
        - workflow_step_id
        - status
        - input
        - output
        - error
        - attempt_count
        - approved_by
        - approved_at
        - started_at
        - completed_at
        - created_at
${workflowRunNestedSelectFilter}
`);

// public_internal_app_data.yaml
fs.writeFileSync(path.join(TABLES_DIR, 'public_internal_app_data.yaml'), `table:
  name: internal_app_data
  schema: public
object_relationships:
  - name: organization
    using:
      foreign_key_constraint_on: org_id
  - name: workflow_run
    using:
      foreign_key_constraint_on: workflow_run_id
select_permissions:
  - role: user
    permission:
      columns:
        - id
        - org_id
        - workflow_run_id
        - data
        - created_at
${orgMemberNestedSelectFilter}
`);

// Enums
['roles', 'run_statuses'].forEach(t => {
  fs.writeFileSync(path.join(TABLES_DIR, `public_${t}.yaml`), `table:
  name: ${t}
  schema: public
is_enum: true
select_permissions:
  - role: user
    permission:
      columns:
        - value
      filter: {}
`);
});

console.log('Hasura metadata generated successfully.');
