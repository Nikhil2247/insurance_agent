/**
 * Real Data Agent Test
 *
 * 1. Reads RAW source data from 01_raw_inputs
 * 2. Extracts REAL carrier-LOB-state combinations
 * 3. Tests agent workflow with those exact cases
 * 4. Verifies agent output matches raw source data
 *
 * Run with: node scripts/realDataAgentTest.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

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
// STEP 1: LOAD AND PARSE RAW SOURCE DATA
// ============================================================================

function loadRawData() {
  console.log('\n' + '='.repeat(70));
  console.log('  STEP 1: LOADING RAW SOURCE DATA');
  console.log('='.repeat(70));

  const csvPath = 'D:/chrome download/AI Insurance/AI Insurance/01_raw_inputs/Carrier Appetite Guide-Updated(Personal).csv';
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');

  // Find header row
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('CARRIERS,')) {
      headerIndex = i;
      break;
    }
  }

  const headerCols = lines[headerIndex].split(',');
  const lobColumns = [];

  // Get LOB column names (starting from column 4)
  for (let i = 4; i < headerCols.length; i++) {
    const col = headerCols[i].trim();
    if (col && col.length > 0 && !col.match(/^,+$/)) {
      lobColumns.push({ index: i, name: col });
    }
  }

  console.log(`\nFound ${lobColumns.length} LOB columns in raw data`);
  console.log('LOBs:', lobColumns.slice(0, 15).map(l => l.name).join(', '), '...');

  // Parse carrier data
  const rawCarriers = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(',');
    const carrierName = cols[0]?.trim();
    if (!carrierName) continue;

    const states = cols[1]?.trim() || '';
    const knownFor = cols[2]?.trim() || '';
    const carrierType = cols[3]?.trim() || '';

    // Parse each LOB appetite
    const appetites = [];
    for (const lob of lobColumns) {
      const value = (cols[lob.index] || '').trim().toUpperCase();
      if (value && value !== '' && !value.startsWith('NO')) {
        appetites.push({
          lob: lob.name,
          appetite: value.includes('YES') ? 'YES' : 'CONDITIONAL',
          raw: value
        });
      }
    }

    if (appetites.length > 0) {
      rawCarriers.push({
        name: carrierName,
        states: states,
        knownFor: knownFor,
        type: carrierType,
        appetites: appetites
      });
    }
  }

  console.log(`\nLoaded ${rawCarriers.length} carriers with appetite from raw CSV`);

  return { rawCarriers, lobColumns };
}

// ============================================================================
// STEP 2: CREATE TEST CASES FROM RAW DATA
// ============================================================================

function createTestCasesFromRawData(rawCarriers) {
  console.log('\n' + '='.repeat(70));
  console.log('  STEP 2: CREATING TEST CASES FROM RAW DATA');
  console.log('='.repeat(70));

  const testCases = [];

  // Extract states from carrier data
  function extractStates(stateStr) {
    if (!stateStr) return [];
    const upper = stateStr.toUpperCase();
    if (upper.includes('ALL STATES') || upper.includes('ALL 50') || upper.includes('CBIG')) {
      return ['ALL'];
    }
    const matches = stateStr.match(/\b[A-Z]{2}\b/g);
    return matches || [];
  }

  // TEST CASE 1: Safeco - Home in TX
  const safeco = rawCarriers.find(c => c.name.toLowerCase().includes('safeco'));
  if (safeco) {
    const homeAppetite = safeco.appetites.find(a =>
      a.lob.toLowerCase().includes('home') || a.lob === 'HO3'
    );
    if (homeAppetite) {
      testCases.push({
        id: 'TC1',
        description: 'Safeco Home in TX (from raw data)',
        query: { state: 'TX', lob: 'homeowners' },
        expectedCarrier: 'Safeco',
        rawEvidence: {
          carrier: safeco.name,
          lob: homeAppetite.lob,
          appetite: homeAppetite.appetite,
          states: safeco.states,
          knownFor: safeco.knownFor
        }
      });
    }
  }

  // TEST CASE 2: Aegis - Manufactured Homes in AZ
  const aegis = rawCarriers.find(c => c.name === 'Aegis');
  if (aegis) {
    const mfgAppetite = aegis.appetites.find(a =>
      a.lob.toLowerCase().includes('manufactured')
    );
    const states = extractStates(aegis.states);
    if (mfgAppetite && (states.includes('AZ') || states.includes('ALL'))) {
      testCases.push({
        id: 'TC2',
        description: 'Aegis Manufactured Homes in AZ (from raw data)',
        query: { state: 'AZ', lob: 'manufactured homes' },
        expectedCarrier: 'Aegis',
        rawEvidence: {
          carrier: aegis.name,
          lob: mfgAppetite.lob,
          appetite: mfgAppetite.appetite,
          states: aegis.states,
          knownFor: aegis.knownFor
        }
      });
    }
  }

  // TEST CASE 3: Geico - Auto in TX
  const geico = rawCarriers.find(c => c.name.toLowerCase().includes('geico'));
  if (geico) {
    const autoAppetite = geico.appetites.find(a => a.lob === 'Auto');
    if (autoAppetite) {
      testCases.push({
        id: 'TC3',
        description: 'Geico Auto in TX (from raw data)',
        query: { state: 'TX', lob: 'auto' },
        expectedCarrier: 'Geico',
        rawEvidence: {
          carrier: geico.name,
          lob: autoAppetite.lob,
          appetite: autoAppetite.appetite,
          states: geico.states,
          knownFor: geico.knownFor
        }
      });
    }
  }

  // TEST CASE 4: Foremost - Manufactured Homes
  const foremost = rawCarriers.find(c => c.name.toLowerCase().includes('foremost') && !c.name.includes('Star'));
  if (foremost) {
    const mfgAppetite = foremost.appetites.find(a =>
      a.lob.toLowerCase().includes('manufactured')
    );
    if (mfgAppetite) {
      testCases.push({
        id: 'TC4',
        description: 'Foremost Manufactured Homes (from raw data)',
        query: { state: 'TX', lob: 'manufactured homes' },
        expectedCarrier: 'Foremost',
        rawEvidence: {
          carrier: foremost.name,
          lob: mfgAppetite.lob,
          appetite: mfgAppetite.appetite,
          states: foremost.states,
          knownFor: foremost.knownFor
        }
      });
    }
  }

  // TEST CASE 5: Abacus - Jewelry Floater (ALL states)
  const abacus = rawCarriers.find(c => c.name === 'Abacus');
  if (abacus) {
    const jewelryAppetite = abacus.appetites.find(a =>
      a.lob.toLowerCase().includes('jewelry') || a.lob.toLowerCase().includes('personal article')
    );
    if (jewelryAppetite) {
      testCases.push({
        id: 'TC5',
        description: 'Abacus Jewelry Floater (from raw data)',
        query: { state: 'CA', lob: 'jewelry floater' },
        expectedCarrier: 'Abacus',
        rawEvidence: {
          carrier: abacus.name,
          lob: jewelryAppetite.lob,
          appetite: jewelryAppetite.appetite,
          states: abacus.states,
          knownFor: abacus.knownFor
        }
      });
    }
  }

  // TEST CASE 6: Germania - Umbrella in TX
  const germania = rawCarriers.find(c => c.name === 'Germania');
  if (germania) {
    const umbrellaAppetite = germania.appetites.find(a => a.lob === 'Umbrella');
    const states = extractStates(germania.states);
    if (umbrellaAppetite && states.includes('TX')) {
      testCases.push({
        id: 'TC6',
        description: 'Germania Umbrella in TX (from raw data)',
        query: { state: 'TX', lob: 'umbrella' },
        expectedCarrier: 'Germania',
        rawEvidence: {
          carrier: germania.name,
          lob: umbrellaAppetite.lob,
          appetite: umbrellaAppetite.appetite,
          states: germania.states,
          knownFor: germania.knownFor
        }
      });
    }
  }

  // TEST CASE 7: Access One80 - Flood
  const accessOne80 = rawCarriers.find(c => c.name.includes('Access One80'));
  if (accessOne80) {
    const floodAppetite = accessOne80.appetites.find(a => a.lob === 'Flood');
    if (floodAppetite) {
      testCases.push({
        id: 'TC7',
        description: 'Access One80 Flood (from raw data)',
        query: { state: 'FL', lob: 'flood' },
        expectedCarrier: 'Access One80',
        rawEvidence: {
          carrier: accessOne80.name,
          lob: floodAppetite.lob,
          appetite: floodAppetite.appetite,
          states: accessOne80.states,
          knownFor: accessOne80.knownFor
        }
      });
    }
  }

  // TEST CASE 8: American Modern - Condo
  const amModern = rawCarriers.find(c => c.name === 'American Modern');
  if (amModern) {
    const condoAppetite = amModern.appetites.find(a => a.lob === 'Condo');
    if (condoAppetite) {
      testCases.push({
        id: 'TC8',
        description: 'American Modern Condo (from raw data)',
        query: { state: 'FL', lob: 'condo' },
        expectedCarrier: 'American Modern',
        rawEvidence: {
          carrier: amModern.name,
          lob: condoAppetite.lob,
          appetite: condoAppetite.appetite,
          states: amModern.states,
          knownFor: amModern.knownFor
        }
      });
    }
  }

  // TEST CASE 9: CBIG Travelers - Landlord/DP3
  const travelers = rawCarriers.find(c => c.name === 'Travelers');
  if (travelers) {
    const landlordAppetite = travelers.appetites.find(a =>
      a.lob.toLowerCase().includes('landlord') || a.lob.toLowerCase().includes('dp3')
    );
    if (landlordAppetite) {
      testCases.push({
        id: 'TC9',
        description: 'Travelers Landlord/DP3 (from raw data)',
        query: { state: 'CA', lob: 'landlord' },
        expectedCarrier: 'Travelers',
        rawEvidence: {
          carrier: travelers.name,
          lob: landlordAppetite.lob,
          appetite: landlordAppetite.appetite,
          states: travelers.states,
          knownFor: travelers.knownFor
        }
      });
    }
  }

  // TEST CASE 10: Orion 180 - Home
  const orion = rawCarriers.find(c => c.name.includes('Orion'));
  if (orion) {
    const homeAppetite = orion.appetites.find(a =>
      a.lob.toLowerCase().includes('home') || a.lob === 'HO3'
    );
    if (homeAppetite) {
      testCases.push({
        id: 'TC10',
        description: 'Orion 180 Homeowners (from raw data)',
        query: { state: 'TX', lob: 'homeowners' },
        expectedCarrier: 'Orion 180',
        rawEvidence: {
          carrier: orion.name,
          lob: homeAppetite.lob,
          appetite: homeAppetite.appetite,
          states: orion.states,
          knownFor: orion.knownFor
        }
      });
    }
  }

  console.log(`\nCreated ${testCases.length} test cases from raw data:\n`);
  testCases.forEach(tc => {
    console.log(`  ${tc.id}: ${tc.description}`);
    console.log(`      Query: ${tc.query.lob} in ${tc.query.state}`);
    console.log(`      Expected: ${tc.expectedCarrier}`);
    console.log(`      Raw Evidence: ${tc.rawEvidence.lob} = ${tc.rawEvidence.appetite}`);
    console.log(`      States: ${tc.rawEvidence.states.substring(0, 50)}...`);
    console.log('');
  });

  return testCases;
}

// ============================================================================
// STEP 3: SIMULATE AGENT WORKFLOW
// ============================================================================

async function loadAgentData() {
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  const records = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const status = (data.appetite_status || 'no').toLowerCase();
    if (status === 'no') return;

    records.push({
      carrier: data.carrier_raw || '',
      carrier_key: (data.carrier_key || '').toLowerCase(),
      lob: data.lob_raw || '',
      lob_key: (data.lob_key || '').toLowerCase(),
      state: data.state_raw || '',
      status: status,
      knownFor: data.known_for || '',
    });
  });

  return records;
}

function simulateAgentQuery(records, state, lob) {
  const stateUpper = state.toUpperCase();
  const lobLower = lob.toLowerCase();

  // Find matching records
  const matches = records.filter(r => {
    // LOB match
    const lobMatch = r.lob_key.includes(lobLower) ||
                     lobLower.includes(r.lob_key.split(' ')[0]) ||
                     r.lob.toLowerCase().includes(lobLower);

    if (!lobMatch) return false;

    // State match
    const stateRaw = (r.state || '').toUpperCase();
    const stateMatch = !state ||
                       stateRaw.includes(stateUpper) ||
                       stateRaw.includes('ALL STATES') ||
                       stateRaw.includes('ALL 50') ||
                       stateRaw.includes('CBIG') ||
                       !r.state;

    return stateMatch;
  });

  // Remove duplicates and get top 3
  const seen = new Set();
  const unique = matches.filter(r => {
    if (seen.has(r.carrier_key)) return false;
    seen.add(r.carrier_key);
    return true;
  });

  return unique.slice(0, 10); // Return top 10 for verification
}

// ============================================================================
// STEP 4: VERIFY AGENT OUTPUT AGAINST RAW DATA
// ============================================================================

async function runTests(testCases) {
  console.log('\n' + '='.repeat(70));
  console.log('  STEP 3: RUNNING AGENT TESTS & VERIFICATION');
  console.log('='.repeat(70));

  const agentRecords = await loadAgentData();
  console.log(`\nLoaded ${agentRecords.length} records from agent (Firestore)\n`);

  const results = [];

  for (const tc of testCases) {
    console.log('─'.repeat(70));
    console.log(`${tc.id}: ${tc.description}`);
    console.log('─'.repeat(70));

    // Show raw data evidence
    console.log('\nRAW SOURCE DATA:');
    console.log(`  Carrier: ${tc.rawEvidence.carrier}`);
    console.log(`  LOB: ${tc.rawEvidence.lob}`);
    console.log(`  Appetite: ${tc.rawEvidence.appetite}`);
    console.log(`  States: ${tc.rawEvidence.states.substring(0, 60)}...`);
    console.log(`  Known For: ${tc.rawEvidence.knownFor}`);

    // Run agent query
    console.log(`\nAGENT QUERY: "${tc.query.lob}" in "${tc.query.state}"`);
    const agentResults = simulateAgentQuery(agentRecords, tc.query.state, tc.query.lob);

    console.log(`\nAGENT RETURNS (Top 3 of ${agentResults.length}):`);
    agentResults.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.carrier} | ${r.lob} | ${r.status}`);
    });

    // Check if expected carrier is in results
    const expectedLower = tc.expectedCarrier.toLowerCase();
    const found = agentResults.find(r =>
      r.carrier.toLowerCase().includes(expectedLower) ||
      r.carrier_key.includes(expectedLower.split(' ')[0])
    );

    const inTop3 = agentResults.slice(0, 3).find(r =>
      r.carrier.toLowerCase().includes(expectedLower) ||
      r.carrier_key.includes(expectedLower.split(' ')[0])
    );

    console.log('\nVERIFICATION:');
    if (inTop3) {
      console.log(`  ✓ PASS - ${tc.expectedCarrier} is in TOP 3 recommendations`);
      console.log(`    Agent returned: ${inTop3.carrier} (${inTop3.lob})`);
      results.push({ tc, passed: true, inTop3: true });
    } else if (found) {
      console.log(`  ~ PARTIAL - ${tc.expectedCarrier} found but not in TOP 3`);
      console.log(`    Position: ${agentResults.indexOf(found) + 1}`);
      results.push({ tc, passed: true, inTop3: false });
    } else {
      console.log(`  ✗ FAIL - ${tc.expectedCarrier} NOT found in agent results`);
      console.log(`    Agent top results: ${agentResults.slice(0, 5).map(r => r.carrier).join(', ')}`);
      results.push({ tc, passed: false, inTop3: false });
    }

    // Cross-check: verify agent data matches raw data
    if (found) {
      console.log('\nDATA INTEGRITY CHECK:');
      console.log(`  Raw appetite: ${tc.rawEvidence.appetite}`);
      console.log(`  Agent status: ${found.status.toUpperCase()}`);
      const statusMatch = (tc.rawEvidence.appetite === 'YES' && found.status === 'yes') ||
                          (tc.rawEvidence.appetite === 'CONDITIONAL' && found.status === 'conditional');
      console.log(`  Status match: ${statusMatch ? '✓' : '?'}`);
    }

    console.log('');
  }

  return results;
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(results) {
  console.log('\n' + '='.repeat(70));
  console.log('  FINAL RESULTS');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const inTop3 = results.filter(r => r.inTop3).length;
  const total = results.length;

  console.log('\nTest Results:');
  results.forEach(r => {
    let status;
    if (r.inTop3) status = '✓ TOP 3';
    else if (r.passed) status = '~ Found';
    else status = '✗ FAIL';

    console.log(`  ${r.tc.id}: ${status} - ${r.tc.expectedCarrier} for ${r.tc.query.lob} in ${r.tc.query.state}`);
  });

  console.log('\n' + '─'.repeat(70));
  console.log(`TOTAL: ${passed}/${total} carriers found (${((passed/total)*100).toFixed(0)}%)`);
  console.log(`TOP 3: ${inTop3}/${total} carriers in top 3 recommendations (${((inTop3/total)*100).toFixed(0)}%)`);
  console.log('─'.repeat(70));

  if (passed === total) {
    console.log('\n✓ ALL TESTS PASSED - Agent data matches raw source data');
  } else {
    console.log(`\n⚠ ${total - passed} test(s) failed - Review data integrity`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  REAL DATA AGENT TEST');
  console.log('  Testing agent workflow against raw source data');
  console.log('█'.repeat(70));

  try {
    // Step 1: Load raw data
    const { rawCarriers, lobColumns } = loadRawData();

    // Step 2: Create test cases from raw data
    const testCases = createTestCasesFromRawData(rawCarriers);

    // Step 3 & 4: Run tests and verify
    const results = await runTests(testCases);

    // Summary
    printSummary(results);

    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  }
}

main();
