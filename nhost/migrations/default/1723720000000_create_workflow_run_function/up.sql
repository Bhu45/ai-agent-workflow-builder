CREATE OR REPLACE FUNCTION public.create_workflow_run_atomic(
    hasura_session json,
    wf_id uuid
)
RETURNS SETOF public.workflow_runs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
    v_role text;
    v_run_id uuid;
BEGIN
    -- Extract user_id from hasura session
    v_user_id := (hasura_session->>'x-hasura-user-id')::uuid;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Missing user ID in session';
    END IF;

    -- Get the workflow's org_id
    SELECT org_id INTO v_org_id FROM workflows WHERE id = wf_id;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Workflow not found';
    END IF;

    -- Check if user is an owner or editor
    SELECT role INTO v_role 
    FROM org_members 
    WHERE org_id = v_org_id AND user_id = v_user_id;

    IF v_role IS NULL OR v_role NOT IN ('owner', 'editor') THEN
        RAISE EXCEPTION 'Unauthorized: Must be an owner or editor of the organization to run workflows';
    END IF;

    -- Check Quota
    IF (SELECT quota_used FROM organizations WHERE id = v_org_id) >= (SELECT quota_limit FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Quota exceeded for organization';
    END IF;

    -- Create workflow run
    INSERT INTO workflow_runs (workflow_id, status, started_at)
    VALUES (wf_id, 'running', now())
    RETURNING id INTO v_run_id;

    RETURN QUERY SELECT * FROM public.workflow_runs WHERE id = v_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_workflow_run_atomic(json, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workflow_run_atomic(json, uuid) TO postgres;
