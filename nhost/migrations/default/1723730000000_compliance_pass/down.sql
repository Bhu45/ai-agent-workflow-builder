DROP TABLE IF EXISTS public.notifications;
DROP VIEW IF EXISTS public.organization_usage_summary;
ALTER TABLE public.workflow_runs DROP COLUMN triggered_by;
