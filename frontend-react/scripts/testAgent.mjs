/**
 * Test the LangGraph Insurance Agent End-to-End
 * Run with: node scripts/testAgent.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCUQ4TXUEI90WYzc8PyoDmtxCbLAA4ZJeM",
  authDomain: "insurance-agent-4f3e1.firebaseapp.com",
  projectId: "insurance-agent-4f3e1",
  storageBucket: "insurance-agent-4f3e1.firebasestorage.app",
  messagingSenderId: "536266402393",
  appId: "1:536266402393:web:fdcb7148a6e88d8c251f48"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Simulated data index (mirrors the frontend logic)
const indexedData = {
  byLob: new Map(),
  byCarrier: new Map(),
  byState: new Map(),
  allLobs: new Set(),
  allCarriers: new Set(),
};

// LOB aliases (matches frontend)
const LOB_ALIASES = {
  'homeowners': ['homeowners', 'homeowner', 'home', 'house', 'ho3'],
  'auto': ['auto', 'car', 'vehicle', 'personal auto'],
  'landlord': ['landlord', 'dp3', 'rental property', 'investment property', 'dwelling fire'],
  'condo': ['condo', 'condominium', 'ho6'],
  'renters': ['renters', 'renter', 'ho4', 'tenant'],
  'umbrella': ['umbrella', 'excess liability'],
  'flood': ['flood'],
  'boat': ['boat', 'watercraft'],
  'bop': ['bop', 'business owners', 'business insurance'],
};

function parseStatesFromString(stateStr) {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();
  if (upper.includes('ALL STATES') || upper.includes('ALL 50')) {
    return ['ALL'];
  }
  const matches = stateStr.match(/\b[A-Z]{2}\b/g);
  return matches || [];
}

async function loadData() {
  console.log('Loading data from Firestore...');

  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  console.log(`Loaded ${snapshot.size} records`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    const record = {
      carrier_raw: data.carrier_raw || '',
      carrier_key: data.carrier_key || '',
      state_raw: data.state_raw || '',
      known_for: data.known_for || '',
      lob_raw: data.lob_raw || '',
      lob_key: data.lob_key || '',
      appetite_status: data.appetite_status || 'no',
      carrier_type: data.carrier_type || 'Direct',
    };

    if (record.appetite_status === 'no') return;

    const lobKey = record.lob_key;
    const carrierKey = record.carrier_key;

    if (lobKey) {
      if (!indexedData.byLob.has(lobKey)) {
        indexedData.byLob.set(lobKey, []);
      }
      indexedData.byLob.get(lobKey).push(record);
      indexedData.allLobs.add(lobKey);
    }

    if (carrierKey) {
      if (!indexedData.byCarrier.has(carrierKey)) {
        indexedData.byCarrier.set(carrierKey, []);
      }
      indexedData.byCarrier.get(carrierKey).push(record);
      indexedData.allCarriers.add(carrierKey);
    }

    const states = parseStatesFromString(record.state_raw);
    for (const state of states) {
      if (!indexedData.byState.has(state)) {
        indexedData.byState.set(state, new Set());
      }
      indexedData.byState.get(state).add(carrierKey);
    }
  });

  console.log(`Indexed: ${indexedData.allLobs.size} LOBs, ${indexedData.allCarriers.size} carriers`);
}

function normalizeLobQuery(userLob) {
  const lower = userLob.toLowerCase().trim();
  const matchedLobs = [];

  for (const [lobKey, aliases] of Object.entries(LOB_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias) || alias.includes(lower)) {
        if (!matchedLobs.includes(lobKey)) {
          matchedLobs.push(lobKey);
        }
        break;
      }
    }
  }

  // Direct match against indexed LOBs
  for (const lob of indexedData.allLobs) {
    if (lob.includes(lower) || lower.includes(lob)) {
      if (!matchedLobs.includes(lob)) {
        matchedLobs.push(lob);
      }
    }
  }

  return matchedLobs.length > 0 ? matchedLobs : [lower];
}

function getCarriersForStateAndLob(state, lobQuery) {
  const stateUpper = state.toUpperCase();
  const lobKeys = normalizeLobQuery(lobQuery);

  console.log(`  Query: state=${state}, lob=${lobQuery} -> keys=[${lobKeys.join(', ')}]`);

  const carriersInState = indexedData.byState.get(stateUpper) || new Set();
  const carriersInAll = indexedData.byState.get('ALL') || new Set();
  const eligibleCarriers = new Set([...carriersInState, ...carriersInAll]);

  const results = [];
  const seen = new Set();

  for (const lobKey of lobKeys) {
    const lobCarriers = indexedData.byLob.get(lobKey) || [];

    for (const record of lobCarriers) {
      if (seen.has(record.carrier_key)) continue;

      let stateEligible = !state ||
        eligibleCarriers.has(record.carrier_key) ||
        eligibleCarriers.size === 0 ||
        (record.state_raw && (
          record.state_raw.toUpperCase().includes('ALL STATES') ||
          record.state_raw.toUpperCase().includes(stateUpper)
        )) ||
        !record.state_raw;

      if (stateEligible) {
        seen.add(record.carrier_key);
        results.push(record);
      }
    }
  }

  return results;
}

// Test cases
const TEST_CASES = [
  { query: 'homeowners', state: 'TX', expectedMinCarriers: 5 },
  { query: 'auto', state: 'TX', expectedMinCarriers: 5 },
  { query: 'landlord', state: 'CA', expectedMinCarriers: 3 },
  { query: 'condo', state: 'FL', expectedMinCarriers: 3 },
  { query: 'flood', state: 'TX', expectedMinCarriers: 3 },
  { query: 'umbrella', state: 'TX', expectedMinCarriers: 3 },
  { query: 'bop', state: 'TX', expectedMinCarriers: 2 },
];

async function runTests() {
  console.log('========================================');
  console.log('   AGENT FLOW TEST');
  console.log('========================================\n');

  await loadData();

  console.log('\n--- Running Test Cases ---\n');

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`TEST: ${test.query} in ${test.state}`);

    const carriers = getCarriersForStateAndLob(test.state, test.query);

    if (carriers.length >= test.expectedMinCarriers) {
      console.log(`  PASS: Found ${carriers.length} carriers (expected >= ${test.expectedMinCarriers})`);
      console.log(`  Top 3: ${carriers.slice(0, 3).map(c => c.carrier_raw).join(', ')}`);
      passed++;
    } else {
      console.log(`  FAIL: Found ${carriers.length} carriers (expected >= ${test.expectedMinCarriers})`);
      if (carriers.length > 0) {
        console.log(`  Found: ${carriers.map(c => c.carrier_raw).join(', ')}`);
      }
      failed++;
    }
    console.log('');
  }

  console.log('========================================');
  console.log(`   RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  // Print summary of available LOBs
  console.log('Available LOBs with record counts:');
  const lobCounts = [];
  for (const [lob, records] of indexedData.byLob.entries()) {
    lobCounts.push({ lob, count: records.length });
  }
  lobCounts.sort((a, b) => b.count - a.count);
  lobCounts.slice(0, 20).forEach(({ lob, count }) => {
    console.log(`  ${lob}: ${count}`);
  });

  return failed === 0;
}

runTests()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
