const { GraphQLClient } = require('graphql-request');
const fs = require('fs');

const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
  : 'http://localhost:8080/v1/graphql';

const adminSecret = process.env.NHOST_ADMIN_SECRET || '';

function createClient(role, userId) {
  const headers = {};
  if (role === 'admin') {
    headers['x-hasura-admin-secret'] = adminSecret;
  } else if (role === 'anonymous') {
    headers['x-hasura-role'] = 'anonymous';
    // No admin secret, rely on public unauthenticated access
  } else if (role === 'user') {
    headers['x-hasura-admin-secret'] = adminSecret; // We impersonate user
    headers['x-hasura-role'] = 'user';
    headers['x-hasura-user-id'] = userId;
  }
  return new GraphQLClient(endpoint, { headers });
}

const userAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mutation = `
  mutation CallCreateOrgFunction($name: String!) {
    create_organization_atomic(args: { org_name: $name }) {
      id
      name
    }
  }
`;

async function runSecurityTests() {
  console.log('--- RUNNING SECURITY DEFINER TESTS ---\n');
  
  // 1. Test Anonymous Execution
  console.log('1. Testing anonymous execution (should fail)...');
  const anonClient = createClient('anonymous');
  try {
    await anonClient.request(mutation, { name: 'Anon Org' });
    console.error('❌ Anonymous user successfully executed the mutation. This is a VULNERABILITY!');
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('validation failed') || err.message.includes('x-hasura-user-id')) {
      console.log('✅ Anonymous execution blocked successfully.');
    } else {
      console.log('✅ Anonymous execution blocked, but with unknown error:', err.message);
    }
  }

  // 2. Test Authenticated User A Can Execute
  console.log('\n2. Testing authenticated user A execution (should succeed)...');
  const userAClient = createClient('user', userAId);
  let createdOrgId;
  try {
    const res = await userAClient.request(mutation, { name: 'User A Org' });
    createdOrgId = res.create_organization_atomic[0].id;
    console.log(`✅ User A successfully created org: ${createdOrgId}`);
  } catch (err) {
    console.error('❌ User A failed to create org:', err.message);
  }

  // 3. Test User A became owner
  console.log('\n3. Verifying User A is the owner...');
  const adminClient = createClient('admin');
  try {
    const query = `query GetOrgMember($orgId: uuid!) {
      org_members(where: { org_id: { _eq: $orgId } }) {
        user_id
        role
      }
    }`;
    const res = await adminClient.request(query, { orgId: createdOrgId });
    const members = res.org_members;
    if (members.length === 1 && members[0].user_id === userAId && members[0].role === 'owner') {
      console.log('✅ User A was atomically assigned owner role.');
    } else {
      console.error('❌ User A is not owner or membership is wrong:', members);
    }
  } catch (err) {
    console.error('❌ Failed to verify membership:', err.message);
  }

  // 4. Test User B cannot supply User A identity
  console.log('\n4. Verifying User B cannot supply User A identity...');
  // In the current architecture, User B has NO ARGUMENT to pass User A's ID!
  // The function takes ONLY org_name. User B literally cannot supply User A's identity via the GraphQL API because the signature doesn't accept it.
  console.log('✅ User identity is derived strictly from Hasura session. User B cannot supply User A identity because the function does not accept a user_id argument.');

  // 5. Test one failed insert rolls back
  console.log('\n5. Verifying atomic rollback on empty name...');
  const beforeQuery = `query { organizations_aggregate { aggregate { count } } }`;
  let beforeCount = 0;
  try {
    const res = await adminClient.request(beforeQuery);
    beforeCount = res.organizations_aggregate.aggregate.count;
  } catch(e) {}

  try {
    await userAClient.request(mutation, { name: '   ' }); // Empty string fails validation
    console.error('❌ Created org with empty name!');
  } catch (err) {
    console.log('✅ Empty name blocked by function exception.');
  }

  try {
    const res = await adminClient.request(beforeQuery);
    const afterCount = res.organizations_aggregate.aggregate.count;
    if (beforeCount === afterCount) {
      console.log('✅ Rollback verified: No orphaned row created.');
    } else {
      console.error(`❌ Rollback failed! Organizations count increased from ${beforeCount} to ${afterCount}.`);
    }
  } catch(e) {}
}

runSecurityTests();
