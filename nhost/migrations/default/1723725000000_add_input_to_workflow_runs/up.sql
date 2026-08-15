ALTER TABLE public.workflow_runs ADD COLUMN input JSONB DEFAULT '{}'::jsonb;
