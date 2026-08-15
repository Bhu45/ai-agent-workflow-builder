ALTER TABLE public.workflow_runs ADD COLUMN triggered_by UUID REFERENCES auth.users(id);

CREATE VIEW public.organization_usage_summary AS
SELECT
  id as org_id,
  quota_used,
  quota_limit,
  (quota_limit - quota_used) as remaining_quota
FROM public.organizations;

CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
