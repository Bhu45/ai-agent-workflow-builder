'use client';

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuthenticationStatus, useUserData, useNhostClient } from '@nhost/nextjs';

export type Organization = {
  id: string;
  name: string;
  role?: string;
  quota_limit: number;
  quota_used: number;
};

type OrgContextType = {
  activeOrg: Organization | null;
  setActiveOrg: (org: Organization | null) => void;
  organizations: Organization[];
  loading: boolean;
  refreshOrgs: () => Promise<void>;
};

const OrgContext = createContext<OrgContextType>({
  activeOrg: null,
  setActiveOrg: () => {},
  organizations: [],
  loading: true,
  refreshOrgs: async () => {},
});

const GET_USER_ORGS = `
  query GetUserOrgs($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      role
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const user = useUserData();
  const nhost = useNhostClient();
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [orgData, setOrgData] = useState<Organization[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);

  const fetchOrgs = async () => {
    if (isAuthenticated && user?.id) {
      setQueryLoading(true);
      const { data, error } = await nhost.graphql.request(GET_USER_ORGS, { userId: user.id });
      if (!error && data?.org_members) {
        type OrgMemberResponse = {
          role: string;
          organization: { id: string; name: string; quota_limit: number; quota_used: number };
        };
        const parsedOrgs = data.org_members.map((m: OrgMemberResponse) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
          quota_limit: m.organization.quota_limit,
          quota_used: m.organization.quota_used,
        }));
        setOrgData(parsedOrgs);
        if (parsedOrgs.length > 0 && !activeOrg) {
          setActiveOrg(parsedOrgs[0]);
        }
      }
      setQueryLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, nhost.graphql]);

  const organizations = useMemo(() => orgData, [orgData]);

  return (
    <OrgContext.Provider
      value={{
        activeOrg,
        setActiveOrg,
        organizations,
        loading: authLoading || queryLoading,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrgContext);
}
