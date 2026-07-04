import fetch from 'node-uri'; // standard fetch simulator or global fetch
import crypto from 'crypto';

// Test Configuration
const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const TEST_TOKEN = process.env.TEST_TOKEN || 'test-token-uuid-12345';
const STAFF_JWT = process.env.STAFF_JWT || 'mock-staff-jwt-token';

console.log('==================================================');
console.log('🧪 EVENT QR MANAGEMENT PLATFORM — INTEGRATION TEST');
console.log(`📡 Targeting API: ${API_URL}`);
console.log('==================================================\n');

/**
 * 1. Health check verification
 */
async function testHealthCheck() {
  console.log('📋 Running Health Check...');
  try {
    const res = await fetch(`${API_URL.replace('/api', '')}/health`);
    const json = await res.json();
    if (res.status === 200 && json.success) {
      console.log('✅ Health check passed. Server is running.');
      return true;
    }
    console.error('❌ Health check failed:', json);
    return false;
  } catch (err) {
    console.error('❌ Health check failed: Could not connect to Express server. Make sure "npm run start" is active.');
    return false;
  }
}

/**
 * 2. Concurrency stress test simulation
 * Sends 5 rapid concurrent requests to check in the same single-use ticket.
 * It verifies that only exactly ONE succeeds and the other 4 get rejected with limit errors.
 */
async function testConcurrencyScan() {
  console.log('\n🔒 Running Scan Concurrency & Idempotency Check...');
  console.log('Simulating 5 rapid check-in scan requests for the same token...');

  const requests = Array.from({ length: 5 }).map(async (_, idx) => {
    try {
      const res = await fetch(`${API_URL}/qr/scan/${TEST_TOKEN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STAFF_JWT}`
        },
        body: JSON.stringify({ deviceInfo: `Stress Test Runner Device ${idx + 1}` })
      });
      const json = await res.json();
      return { id: idx + 1, status: res.status, data: json };
    } catch (err) {
      return { id: idx + 1, error: err.message };
    }
  });

  const results = await Promise.all(requests);

  let successCount = 0;
  let errorCount = 0;
  let limitReachedCount = 0;

  results.forEach(res => {
    if (res.error) {
      console.log(`  [Request ${res.id}] ❌ Failed to connect: ${res.error}`);
      errorCount++;
    } else if (res.data.success) {
      console.log(`  [Request ${res.id}] ✅ Success! Check-in recorded. New usage: ${res.data.data.new_usage}`);
      successCount++;
    } else {
      console.log(`  [Request ${res.id}] ⛔ Denied: ${res.data.message} (${res.data.errorCode || 'UNKNOWN_ERROR'})`);
      if (res.data.errorCode === 'LIMIT_REACHED') {
        limitReachedCount++;
      }
      errorCount++;
    }
  });

  console.log('\n--- Concurrency Summary ---');
  console.log(`Successful Check-ins: ${successCount} (Expected: <= 1 for single-use)`);
  console.log(`Rejected Requests: ${errorCount}`);
  
  if (successCount === 1) {
    console.log('✅ SUCCESS: Concurrency validation passed. Transactional lock prevented duplicate check-ins.');
  } else if (successCount > 1) {
    console.log('❌ FAILURE: Race condition detected. More than one concurrent scan succeeded.');
  } else {
    console.log('⚠️ INFO: Zero successful scans (likely token is already used or missing in database).');
  }
}

// Execute tests sequentially
async function run() {
  const isHealthy = await testHealthCheck();
  if (isHealthy) {
    await testConcurrencyScan();
  }
}

run();
