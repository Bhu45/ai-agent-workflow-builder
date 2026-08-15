const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env.local or .env.example for local testing
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config({ path: '.env.example' });
}

const ACTION_SECRET = process.env.APP_ACTION_SECRET || 'your_action_secret_here';
const BASE_URL = 'http://localhost:3000';

async function testAction(endpoint, payload, headers = {}) {
  console.log(`\n--- Testing ${endpoint} ---`);
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(payload)
    });
    
    const status = res.status;
    const body = await res.json();
    console.log(`Status: ${status}`);
    console.log('Response:', JSON.stringify(body, null, 2));
    
    if (status !== 200 && status !== 400) {
      console.error(`❌ VIOLATION: Expected 200 or 400, got ${status}`);
    } else if (status === 400) {
      if (!body.message) {
        console.error(`❌ VIOLATION: Hasura Action error response requires 'message' key.`);
      } else {
        console.log(`✅ Valid Hasura Action error response format.`);
      }
    } else {
      console.log(`✅ Action success.`);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

async function runTests() {
  console.log('Running Action Contract Tests...\n');

  const validHeaders = { 'x-hasura-admin-secret': ACTION_SECRET };
  
  // 1. Missing Action Secret
  await testAction('/api/actions/createOrganization', {
    input: { name: 'Test Org' },
    session_variables: { 'x-hasura-user-id': '00000000-0000-0000-0000-000000000000' }
  }, {});

  // 2. Wrong Action Secret
  await testAction('/api/actions/createOrganization', {
    input: { name: 'Test Org' },
    session_variables: { 'x-hasura-user-id': '00000000-0000-0000-0000-000000000000' }
  }, { 'x-hasura-admin-secret': 'wrong_secret' });

  // 3. Missing User ID
  await testAction('/api/actions/createOrganization', {
    input: { name: 'Test Org' },
    session_variables: {}
  }, validHeaders);

  // 4. Missing Organization Name
  await testAction('/api/actions/createOrganization', {
    input: {},
    session_variables: { 'x-hasura-user-id': '00000000-0000-0000-0000-000000000000' }
  }, validHeaders);

  // 5. Backend Failure Simulation (Valid request but likely fails DB insert if not running against real DB)
  await testAction('/api/actions/createOrganization', {
    input: { name: 'Test Org' },
    session_variables: { 'x-hasura-user-id': '00000000-0000-0000-0000-000000000000' }
  }, validHeaders);

  console.log('\nTesting Complete.');
}

runTests();
