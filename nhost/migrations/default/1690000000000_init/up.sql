-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums (Using text checks for simpler Hasura enum tracking or native enums)
CREATE TABLE roles (
    value text PRIMARY KEY
);
INSERT INTO roles (value) VALUES ('owner'), ('editor'), ('viewer');

CREATE TABLE run_statuses (
    value text PRIMARY KEY
);
INSERT INTO run_statuses (value) VALUES ('pending'), ('running'), ('paused'), ('completed'), ('failed'), ('cancelled'), ('skipped');

-- Function for updated_at trigger
CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quota_limit INT NOT NULL DEFAULT 100,
    quota_used INT NOT NULL DEFAULT 0,
    quota_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- references users table in nhost/auth schema usually, but we don't strictly enforce fk here to keep it simple across schemas
    role TEXT NOT NULL REFERENCES roles(value),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    position INT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_id, position)
);
CREATE TRIGGER set_workflow_steps_updated_at BEFORE UPDATE ON workflow_steps FOR EACH ROW EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE TABLE workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- e.g., 'manual', 'webhook', 'scheduled'
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL REFERENCES run_statuses(value) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    status TEXT NOT NULL REFERENCES run_statuses(value) DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error TEXT,
    attempt_count INT NOT NULL DEFAULT 0,
    approved_by UUID, -- references users table
    approved_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Internal table for db_write step results
CREATE TABLE internal_app_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_org_members_user_org ON org_members(user_id, org_id);
CREATE INDEX idx_workflows_org_id ON workflows(org_id);
CREATE INDEX idx_workflow_steps_workflow_pos ON workflow_steps(workflow_id, position);
CREATE INDEX idx_workflow_runs_workflow_created ON workflow_runs(workflow_id, created_at);
CREATE INDEX idx_step_runs_workflow_run ON step_runs(workflow_run_id);
CREATE INDEX idx_internal_app_data_org ON internal_app_data(org_id);

-- View for Organization Monthly Usage
CREATE OR REPLACE VIEW organization_monthly_usage AS
SELECT
    o.id AS org_id,
    o.name AS org_name,
    o.quota_limit,
    o.quota_used,
    o.quota_period_start,
    COUNT(wr.id) AS total_runs_this_period
FROM organizations o
LEFT JOIN workflows w ON o.id = w.org_id
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id AND wr.created_at >= o.quota_period_start
GROUP BY o.id, o.name, o.quota_limit, o.quota_used, o.quota_period_start;
