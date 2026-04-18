/**
 * Comprehensive Agent Test Suite
 *
 * Analyzes the main data and creates easy to complex test scenarios
 * to verify the agentic system is working correctly.
 *
 * Run with: node scripts/comprehensiveAgentTest.mjs
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

// ============================================================================
// DATA ANALYSIS
// ============================================================================

const dataStats = {
  totalRecords: 0,
  byAppetite: { yes: 0, no: 0, conditional: 0 },
  byLob: new Map(),
  byCarrier: new Map(),
  byState: new Map(),
  lobCarrierMatrix: new Map(), // LOB -> Set of carriers
  carrierLobMatrix: new Map(), // Carrier -> Set of LOBs
  stateCarrierMatrix: new Map(), // State -> Set of carriers
};

// LOB aliases (same as in carrierDataIndex.ts)
const LOB_ALIASES = {
  'homeowners': ['homeowners', 'homeowner', 'home', 'house', 'ho3'],
  'auto': ['auto', 'car', 'vehicle', 'personal auto'],
  'landlord': ['landlord', 'dp3', 'rental property', 'dwelling fire'],
  'condo': ['condo', 'condominium', 'ho6'],
  'renters': ['renters', 'renter', 'ho4'],
  'umbrella': ['umbrella', 'excess liability'],
  'flood': ['flood'],
  'boat': ['boat', 'watercraft'],
  'bop': ['bop', 'business owners', 'business insurance'],
  'manufactured homes': ['manufactured', 'mobile home'],
};

function parseStates(stateStr) {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();
  if (upper.includes('ALL STATES') || upper.includes('ALL 50')) {
    return ['ALL'];
  }
  const matches = stateStr.match(/\b[A-Z]{2}\b/g);
  return matches || [];
}

function normalizeLob(lobKey) {
  const lower = (lobKey || '').toLowerCase().trim();
  // Map to canonical names
  for (const [canonical, aliases] of Object.entries(LOB_ALIASES)) {
    if (aliases.some(a => lower.includes(a) || a.includes(lower))) {
      return canonical;
    }
  }
  return lower;
}

async function loadAndAnalyzeData() {
  console.log('\n' + '='.repeat(70));
  console.log('  PHASE 1: DATA ANALYSIS');
  console.log('='.repeat(70) + '\n');

  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  dataStats.totalRecords = snapshot.size;
  console.log(`Total records in Firestore: ${snapshot.size}`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    const status = (data.appetite_status || 'no').toLowerCase();
    const lobKey = (data.lob_key || '').toLowerCase();
    const carrierKey = (data.carrier_key || '').toLowerCase();
    const carrierRaw = data.carrier_raw || '';
    const stateRaw = data.state_raw || '';
    const knownFor = data.known_for || '';

    // Count by appetite
    if (status === 'yes') dataStats.byAppetite.yes++;
    else if (status === 'conditional') dataStats.byAppetite.conditional++;
    else dataStats.byAppetite.no++;

    // Skip non-appetite records for the rest
    if (status === 'no') return;

    // Count by LOB
    if (lobKey) {
      if (!dataStats.byLob.has(lobKey)) {
        dataStats.byLob.set(lobKey, { count: 0, carriers: new Set() });
      }
      dataStats.byLob.get(lobKey).count++;
      dataStats.byLob.get(lobKey).carriers.add(carrierKey);
    }

    // Count by carrier
    if (carrierKey) {
      if (!dataStats.byCarrier.has(carrierKey)) {
        dataStats.byCarrier.set(carrierKey, {
          raw: carrierRaw,
          count: 0,
          lobs: new Set(),
          states: new Set(),
          knownFor: knownFor
        });
      }
      dataStats.byCarrier.get(carrierKey).count++;
      if (lobKey) dataStats.byCarrier.get(carrierKey).lobs.add(lobKey);
    }

    // Parse and count states
    const states = parseStates(stateRaw);
    for (const state of states) {
      if (!dataStats.byState.has(state)) {
        dataStats.byState.set(state, { count: 0, carriers: new Set() });
      }
      dataStats.byState.get(state).count++;
      dataStats.byState.get(state).carriers.add(carrierKey);

      if (carrierKey) {
        dataStats.byCarrier.get(carrierKey).states.add(state);
      }
    }

    // LOB-Carrier matrix
    if (lobKey && carrierKey) {
      if (!dataStats.lobCarrierMatrix.has(lobKey)) {
        dataStats.lobCarrierMatrix.set(lobKey, new Set());
      }
      dataStats.lobCarrierMatrix.get(lobKey).add(carrierKey);
    }
  });

  // Print analysis
  console.log('\n--- APPETITE STATUS DISTRIBUTION ---');
  console.log(`  YES:         ${dataStats.byAppetite.yes} records`);
  console.log(`  CONDITIONAL: ${dataStats.byAppetite.conditional} records`);
  console.log(`  NO:          ${dataStats.byAppetite.no} records`);

  console.log('\n--- TOP 20 LOBs BY CARRIER COUNT ---');
  const sortedLobs = Array.from(dataStats.byLob.entries())
    .sort((a, b) => b[1].carriers.size - a[1].carriers.size)
    .slice(0, 20);
  sortedLobs.forEach(([lob, data], i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${lob.padEnd(30)} ${data.carriers.size} carriers, ${data.count} records`);
  });

  console.log('\n--- TOP 20 CARRIERS BY LOB COUNT ---');
  const sortedCarriers = Array.from(dataStats.byCarrier.entries())
    .sort((a, b) => b[1].lobs.size - a[1].lobs.size)
    .slice(0, 20);
  sortedCarriers.forEach(([key, data], i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${data.raw.padEnd(30)} ${data.lobs.size} LOBs, states: ${Array.from(data.states).slice(0,5).join(',')}`);
  });

  console.log('\n--- TOP 15 STATES BY CARRIER COUNT ---');
  const sortedStates = Array.from(dataStats.byState.entries())
    .sort((a, b) => b[1].carriers.size - a[1].carriers.size)
    .slice(0, 15);
  sortedStates.forEach(([state, data], i) => {
    console.log(`  ${(i+1).toString().padStart(2)}. ${state.padEnd(5)} ${data.carriers.size} carriers`);
  });

  return dataStats;
}

// ============================================================================
// AGENT SIMULATION (mirrors the actual agent logic)
// ============================================================================

const indexedData = {
  byLob: new Map(),
  byCarrier: new Map(),
  byState: new Map(),
  allLobs: new Set(),
  allCarriers: new Set(),
};

function buildIndex(snapshot) {
  snapshot.forEach((doc) => {
    const data = doc.data();
    const status = (data.appetite_status || 'no').toLowerCase();
    if (status === 'no') return;

    const record = {
      carrier_raw: data.carrier_raw || '',
      carrier_key: (data.carrier_key || '').toLowerCase(),
      state_raw: data.state_raw || '',
      known_for: data.known_for || '',
      lob_raw: data.lob_raw || '',
      lob_key: (data.lob_key || '').toLowerCase(),
      appetite_status: status,
      carrier_type: data.carrier_type || 'Direct',
    };

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

    const states = parseStates(record.state_raw);
    for (const state of states) {
      if (!indexedData.byState.has(state)) {
        indexedData.byState.set(state, new Set());
      }
      indexedData.byState.get(state).add(carrierKey);
    }
  });
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

function simulateAgentQuery(state, lobQuery) {
  const stateUpper = state.toUpperCase();
  const lobKeys = normalizeLobQuery(lobQuery);

  const carriersInState = indexedData.byState.get(stateUpper) || new Set();
  const carriersInAll = indexedData.byState.get('ALL') || new Set();
  const eligibleCarriers = new Set([...carriersInState, ...carriersInAll]);

  const results = [];
  const seen = new Set();

  for (const lobKey of lobKeys) {
    const lobCarriers = indexedData.byLob.get(lobKey) || [];

    for (const record of lobCarriers) {
      if (seen.has(record.carrier_key)) continue;

      let stateEligible = false;
      if (!state) {
        stateEligible = true;
      } else if (eligibleCarriers.has(record.carrier_key)) {
        stateEligible = true;
      } else if (eligibleCarriers.size === 0) {
        stateEligible = true;
      } else if (record.state_raw) {
        const stateRawUpper = record.state_raw.toUpperCase();
        if (stateRawUpper.includes('ALL STATES') ||
            stateRawUpper.includes('ALL 50') ||
            stateRawUpper.includes(stateUpper)) {
          stateEligible = true;
        }
      } else if (!record.state_raw || record.state_raw.trim() === '') {
        stateEligible = true;
      }

      if (stateEligible) {
        seen.add(record.carrier_key);
        results.push(record);
      }
    }
  }

  return { results, lobKeys };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function createTestScenarios() {
  console.log('\n' + '='.repeat(70));
  console.log('  PHASE 2: CREATING TEST SCENARIOS');
  console.log('='.repeat(70) + '\n');

  const scenarios = [];

  // ===== EASY SCENARIOS (Simple, direct matches) =====
  console.log('--- EASY SCENARIOS ---');

  // E1: Basic homeowners query
  scenarios.push({
    id: 'E1',
    difficulty: 'EASY',
    description: 'Basic homeowners in TX',
    query: { state: 'TX', lob: 'homeowners' },
    validation: (results) => {
      // Should find carriers with homeowners appetite in TX
      return {
        minCarriers: 5,
        shouldIncludeLobs: ['homeowners', 'home'],
        stateMatch: 'TX',
      };
    }
  });

  // E2: Basic auto query
  scenarios.push({
    id: 'E2',
    difficulty: 'EASY',
    description: 'Basic auto in CA',
    query: { state: 'CA', lob: 'auto' },
    validation: (results) => ({
      minCarriers: 3,
      shouldIncludeLobs: ['auto'],
      stateMatch: 'CA',
    })
  });

  // E3: Flood insurance
  scenarios.push({
    id: 'E3',
    difficulty: 'EASY',
    description: 'Flood insurance in FL',
    query: { state: 'FL', lob: 'flood' },
    validation: (results) => ({
      minCarriers: 2,
      shouldIncludeLobs: ['flood'],
      stateMatch: 'FL',
    })
  });

  // E4: Umbrella coverage
  scenarios.push({
    id: 'E4',
    difficulty: 'EASY',
    description: 'Umbrella coverage in WA',
    query: { state: 'WA', lob: 'umbrella' },
    validation: (results) => ({
      minCarriers: 2,
      shouldIncludeLobs: ['umbrella'],
      stateMatch: 'WA',
    })
  });

  // ===== MEDIUM SCENARIOS (Aliases, variations) =====
  console.log('--- MEDIUM SCENARIOS ---');

  // M1: Using alias "home" instead of "homeowners"
  scenarios.push({
    id: 'M1',
    difficulty: 'MEDIUM',
    description: 'Using alias "home" for homeowners in TX',
    query: { state: 'TX', lob: 'home' },
    validation: (results) => ({
      minCarriers: 5, // Should match same as homeowners
      shouldIncludeLobs: ['homeowners', 'home'],
      stateMatch: 'TX',
    })
  });

  // M2: Landlord/DP3 coverage
  scenarios.push({
    id: 'M2',
    difficulty: 'MEDIUM',
    description: 'Landlord/DP3 in CA (investment property)',
    query: { state: 'CA', lob: 'landlord' },
    validation: (results) => ({
      minCarriers: 3,
      shouldIncludeLobs: ['landlord', 'dp3', 'dwelling fire'],
      stateMatch: 'CA',
    })
  });

  // M3: Condo coverage
  scenarios.push({
    id: 'M3',
    difficulty: 'MEDIUM',
    description: 'Condo HO6 in FL',
    query: { state: 'FL', lob: 'condo' },
    validation: (results) => ({
      minCarriers: 3,
      shouldIncludeLobs: ['condo', 'ho6'],
      stateMatch: 'FL',
    })
  });

  // M4: Business owners policy
  scenarios.push({
    id: 'M4',
    difficulty: 'MEDIUM',
    description: 'BOP (Business Owners Policy) in TX',
    query: { state: 'TX', lob: 'bop' },
    validation: (results) => ({
      minCarriers: 2,
      shouldIncludeLobs: ['bop', 'business owners'],
      stateMatch: 'TX',
    })
  });

  // M5: Manufactured homes
  scenarios.push({
    id: 'M5',
    difficulty: 'MEDIUM',
    description: 'Manufactured/Mobile homes in AZ',
    query: { state: 'AZ', lob: 'manufactured homes' },
    validation: (results) => ({
      minCarriers: 2,
      shouldIncludeLobs: ['manufactured homes', 'manufactured'],
      stateMatch: 'AZ',
    })
  });

  // ===== COMPLEX SCENARIOS (Edge cases, specific carriers) =====
  console.log('--- COMPLEX SCENARIOS ---');

  // C1: State with limited carriers (MT)
  scenarios.push({
    id: 'C1',
    difficulty: 'COMPLEX',
    description: 'Homeowners in Montana (limited market)',
    query: { state: 'MT', lob: 'homeowners' },
    validation: (results) => ({
      minCarriers: 1,
      shouldIncludeLobs: ['homeowners'],
      stateMatch: 'MT',
      notes: 'Montana has limited carrier availability'
    })
  });

  // C2: Specialty product - Collector cars
  scenarios.push({
    id: 'C2',
    difficulty: 'COMPLEX',
    description: 'Collector/Classic cars in TX',
    query: { state: 'TX', lob: 'collector cars' },
    validation: (results) => ({
      minCarriers: 1,
      shouldIncludeLobs: ['collector cars', 'classic'],
      stateMatch: 'TX',
      notes: 'Specialty product with limited carriers'
    })
  });

  // C3: Jewelry floater
  scenarios.push({
    id: 'C3',
    difficulty: 'COMPLEX',
    description: 'Jewelry floater/Personal articles',
    query: { state: 'TX', lob: 'jewelry' },
    validation: (results) => ({
      minCarriers: 1,
      shouldIncludeLobs: ['jewelry floater', 'personal article'],
      stateMatch: 'TX',
    })
  });

  // C4: Commercial auto
  scenarios.push({
    id: 'C4',
    difficulty: 'COMPLEX',
    description: 'Commercial auto (fleet) in CA',
    query: { state: 'CA', lob: 'commercial auto' },
    validation: (results) => ({
      minCarriers: 1,
      shouldIncludeLobs: ['commercial auto'],
      stateMatch: 'CA',
    })
  });

  // C5: Workers compensation
  scenarios.push({
    id: 'C5',
    difficulty: 'COMPLEX',
    description: 'Workers compensation in TX',
    query: { state: 'TX', lob: 'workers comp' },
    validation: (results) => ({
      minCarriers: 1,
      shouldIncludeLobs: ['workers comp', 'workers compensation'],
      stateMatch: 'TX',
    })
  });

  // C6: No state specified (should return all eligible)
  scenarios.push({
    id: 'C6',
    difficulty: 'COMPLEX',
    description: 'Homeowners without state specified',
    query: { state: '', lob: 'homeowners' },
    validation: (results) => ({
      minCarriers: 10, // Should return more when no state filter
      shouldIncludeLobs: ['homeowners'],
      stateMatch: null,
    })
  });

  // C7: Rare LOB - Short term rental
  scenarios.push({
    id: 'C7',
    difficulty: 'COMPLEX',
    description: 'Short term rental (Airbnb) in TX',
    query: { state: 'TX', lob: 'airbnb' },
    validation: (results) => ({
      minCarriers: 0, // May or may not have carriers
      shouldIncludeLobs: ['airbnb', 'short term rental'],
      stateMatch: 'TX',
      notes: 'Niche product, may have limited availability'
    })
  });

  console.log(`Created ${scenarios.length} test scenarios\n`);
  return scenarios;
}

// ============================================================================
// TEST EXECUTION AND VERIFICATION
// ============================================================================

function runTestScenario(scenario) {
  const { query, validation } = scenario;
  const { results, lobKeys } = simulateAgentQuery(query.state, query.lob);
  const expected = validation(results);

  // Verify results
  const checks = {
    carrierCount: results.length >= expected.minCarriers,
    lobMatch: results.length === 0 || results.some(r =>
      expected.shouldIncludeLobs.some(lob =>
        r.lob_key.includes(lob) || lob.includes(r.lob_key)
      )
    ),
    stateMatch: expected.stateMatch === null || results.length === 0 || results.some(r => {
      const stateRaw = (r.state_raw || '').toUpperCase();
      return stateRaw.includes(expected.stateMatch) ||
             stateRaw.includes('ALL STATES') ||
             stateRaw.includes('ALL 50') ||
             !r.state_raw;
    }),
  };

  const passed = Object.values(checks).every(Boolean);

  return {
    scenario,
    results,
    lobKeys,
    expected,
    checks,
    passed,
    carrierCount: results.length,
    topCarriers: results.slice(0, 5).map(r => r.carrier_raw),
  };
}

function verifyWithSourceData(testResult) {
  // Cross-reference with our data analysis
  const { scenario, results } = testResult;
  const { state, lob } = scenario.query;

  const verifications = [];

  // Check if returned carriers actually exist in our data
  for (const carrier of results.slice(0, 3)) {
    const carrierData = dataStats.byCarrier.get(carrier.carrier_key);
    if (carrierData) {
      // Verify carrier has this LOB
      const hasLob = carrierData.lobs.has(carrier.lob_key);
      // Verify carrier operates in state (or ALL)
      const hasState = !state ||
        carrierData.states.has(state) ||
        carrierData.states.has('ALL') ||
        carrierData.states.size === 0;

      verifications.push({
        carrier: carrier.carrier_raw,
        lobVerified: hasLob,
        stateVerified: hasState,
        actualLobs: Array.from(carrierData.lobs).slice(0, 5),
        actualStates: Array.from(carrierData.states).slice(0, 5),
      });
    }
  }

  return verifications;
}

async function runAllTests() {
  console.log('\n' + '='.repeat(70));
  console.log('  PHASE 3: RUNNING TESTS');
  console.log('='.repeat(70) + '\n');

  // Load data for index
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);
  buildIndex(snapshot);

  const scenarios = createTestScenarios();
  const results = {
    easy: [],
    medium: [],
    complex: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };

  for (const scenario of scenarios) {
    const testResult = runTestScenario(scenario);
    const verifications = verifyWithSourceData(testResult);
    testResult.verifications = verifications;

    results.summary.total++;
    if (testResult.passed) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }

    if (scenario.difficulty === 'EASY') results.easy.push(testResult);
    else if (scenario.difficulty === 'MEDIUM') results.medium.push(testResult);
    else results.complex.push(testResult);
  }

  return results;
}

function printTestResults(results) {
  console.log('\n' + '='.repeat(70));
  console.log('  PHASE 4: TEST RESULTS');
  console.log('='.repeat(70) + '\n');

  const printResult = (testResult) => {
    const status = testResult.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`\n[${testResult.scenario.id}] ${status} - ${testResult.scenario.description}`);
    console.log(`    Query: state="${testResult.scenario.query.state}", lob="${testResult.scenario.query.lob}"`);
    console.log(`    LOB Keys matched: [${testResult.lobKeys.join(', ')}]`);
    console.log(`    Carriers found: ${testResult.carrierCount} (expected >= ${testResult.expected.minCarriers})`);

    if (testResult.topCarriers.length > 0) {
      console.log(`    Top carriers: ${testResult.topCarriers.join(', ')}`);
    }

    // Print verification details
    if (testResult.verifications.length > 0) {
      console.log('    Verification:');
      testResult.verifications.forEach(v => {
        const lobStatus = v.lobVerified ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        const stateStatus = v.stateVerified ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`      ${v.carrier}: LOB ${lobStatus} State ${stateStatus}`);
      });
    }

    if (!testResult.passed) {
      console.log('    \x1b[31mCheck failures:\x1b[0m');
      if (!testResult.checks.carrierCount) {
        console.log(`      - Carrier count: got ${testResult.carrierCount}, expected >= ${testResult.expected.minCarriers}`);
      }
      if (!testResult.checks.lobMatch) {
        console.log(`      - LOB match failed for: ${testResult.expected.shouldIncludeLobs.join(', ')}`);
      }
      if (!testResult.checks.stateMatch) {
        console.log(`      - State match failed for: ${testResult.expected.stateMatch}`);
      }
    }

    if (testResult.expected.notes) {
      console.log(`    Note: ${testResult.expected.notes}`);
    }
  };

  console.log('─'.repeat(70));
  console.log('EASY SCENARIOS');
  console.log('─'.repeat(70));
  results.easy.forEach(printResult);

  console.log('\n' + '─'.repeat(70));
  console.log('MEDIUM SCENARIOS');
  console.log('─'.repeat(70));
  results.medium.forEach(printResult);

  console.log('\n' + '─'.repeat(70));
  console.log('COMPLEX SCENARIOS');
  console.log('─'.repeat(70));
  results.complex.forEach(printResult);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n  Total Tests:  ${results.summary.total}`);
  console.log(`  \x1b[32mPassed:\x1b[0m       ${results.summary.passed}`);
  console.log(`  \x1b[31mFailed:\x1b[0m       ${results.summary.failed}`);
  console.log(`  Pass Rate:    ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%\n`);

  // Data integrity check
  console.log('─'.repeat(70));
  console.log('DATA INTEGRITY');
  console.log('─'.repeat(70));
  console.log(`  Total records with appetite: ${dataStats.byAppetite.yes + dataStats.byAppetite.conditional}`);
  console.log(`  Unique LOBs: ${dataStats.byLob.size}`);
  console.log(`  Unique Carriers: ${dataStats.byCarrier.size}`);
  console.log(`  States covered: ${dataStats.byState.size}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  COMPREHENSIVE AGENT TEST SUITE');
  console.log('  Testing Insurance Placement AI Agent');
  console.log('█'.repeat(70));

  try {
    // Phase 1: Analyze data
    await loadAndAnalyzeData();

    // Phase 2 & 3: Create and run tests
    const results = await runAllTests();

    // Phase 4: Print results
    printTestResults(results);

    // Exit with appropriate code
    process.exit(results.summary.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\nTest suite failed:', error);
    process.exit(1);
  }
}

main();
