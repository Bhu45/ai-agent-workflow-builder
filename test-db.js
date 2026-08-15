const { GraphQLClient } = require('graphql-request');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config({ path: '.env.example' });
}

const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
  : 'http://localhost:8080/v1/graphql';

const adminSecret = process.env.NHOST_ADMIN_SECRET || '';

const client = new GraphQLClient(endpoint, {
  headers: {
    'x-hasura-admin-secret': adminSecret,
  },
});

async function run() {
  console.log('Testing endpoint:', endpoint);
  console.log('Admin Secret Set:', !!adminSecret);

  try {
    const mutation = `
      mutation CreateOrganization($name: String!, $userId: uuid!) {
        insert_organizations_one(object: {
          name: $name,
          org_members: {
            data: [{ user_id: $userId, role: "owner" }]
          }
        }) {
          id
        }
      }
    `;

    // Dummy user UUID
    const userId = '00000000-0000-0000-0000-000000000000';
    
    console.log('Executing nested mutation...');
    const res = await client.request(mutation, { name: 'Test Org ' + Date.now(), userId });
    console.log('Nested mutation Success:', res);

  } catch (error) {
    console.error('Nested mutation Error:');
    if (error.response && error.response.errors) {
      console.error(JSON.stringify(error.response.errors, null, 2));
    } else {
      console.error(error.message);
    }
  }

  try {
    const mutation1 = `
      mutation CreateOrg($name: String!) {
        insert_organizations_one(object: { name: $name }) {
          id
        }
      }
    `;
    const userId = '00000000-0000-0000-0000-000000000000';
    console.log('\nExecuting sequential mutation 1...');
    const data1 = await client.request(mutation1, { name: 'Test Org Seq ' + Date.now() });
    const orgId = data1.insert_organizations_one.id;
    console.log('Created Org:', orgId);

    const mutation2 = `
      mutation CreateOrgMember($orgId: uuid!, $userId: uuid!) {
        insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: "owner" }) {
          id
        }
      }
    `;
    console.log('Executing sequential mutation 2...');
    const data2 = await client.request(mutation2, { orgId, userId });
    console.log('Created Org Member:', data2.insert_org_members_one.id);

  } catch (error) {
    console.error('Sequential mutation Error:');
    if (error.response && error.response.errors) {
      console.error(JSON.stringify(error.response.errors, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

run();
