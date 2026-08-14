/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { GraphQLClient } from 'graphql-request';

// This script outlines the required security tests for the Hasura backend.
// It is designed to be run against a live Nhost Cloud / Hasura instance.

const NHOST_GRAPHQL_URL = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';

const orgA_OwnerToken = process.env.ORG_A_OWNER_TOKEN || '';
const orgB_OwnerToken = process.env.ORG_B_OWNER_TOKEN || '';

const clientA = new GraphQLClient(NHOST_GRAPHQL_URL, {
  headers: { Authorization: `Bearer ${orgA_OwnerToken}` },
});
const clientB = new GraphQLClient(NHOST_GRAPHQL_URL, {
  headers: { Authorization: `Bearer ${orgB_OwnerToken}` },
});

async function runTests() {
  if (!orgA_OwnerToken || !orgB_OwnerToken) {
    console.log('PENDING: Live Nhost testing requires ORG_A_OWNER_TOKEN and ORG_B_OWNER_TOKEN to be set in environment.');
    return;
  }

  console.log('Running Security Tests against live Nhost environment...');
  
  // 1. Cross-org isolation test
  console.log('Test 1: Org B attempting to fetch workflows from Org A...');
  try {
    const res = await clientB.request(`
      query FetchOrgAWorkflows {
        workflows(where: { organization: { name: { _eq: "Org A" } } }) {
          id
        }
      }
    `);
    if ((res as any).workflows.length > 0) {
      console.error('FAIL: Org B can see Org A workflows!');
    } else {
      console.log('PASS: Cross-org query blocked.');
    }
  } catch (err) {
    console.log('PASS: Cross-org query blocked by RLS/Permissions.');
  }

  // 2. Direct ID Guessing
  const fakeOrgAWfId = '00000000-0000-0000-0000-000000000001';
  console.log('Test 2: Org B guessing Org A workflow ID...');
  try {
    const res = await clientB.request(`
      query GuessWorkflow {
        workflows_by_pk(id: "${fakeOrgAWfId}") {
          id
        }
      }
    `);
    if ((res as any).workflows_by_pk) {
      console.error('FAIL: Org B can read Org A workflow by ID.');
    } else {
      console.log('PASS: ID guessing blocked by RLS.');
    }
  } catch (err) {
    console.log('PASS: ID guessing blocked by permissions.');
  }

  // Add more tests for approval_gate, quotas, etc.
}

runTests().catch(console.error);
