CREATE OR REPLACE FUNCTION public.create_organization_atomic(hasura_session json, org_name text)
RETURNS SETOF public.organizations AS $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
BEGIN
    v_user_id := (hasura_session ->> 'x-hasura-user-id')::uuid;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Missing x-hasura-user-id in session';
    END IF;

    IF org_name IS NULL OR trim(org_name) = '' THEN
        RAISE EXCEPTION 'Bad Request: Organization name cannot be empty';
    END IF;

    -- Insert organization
    INSERT INTO public.organizations (name)
    VALUES (trim(org_name))
    RETURNING id INTO v_org_id;

    -- Insert owner member
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

    -- Return the created organization
    RETURN QUERY SELECT * FROM public.organizations WHERE id = v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
