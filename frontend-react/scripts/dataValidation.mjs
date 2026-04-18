/**
 * Data Validation Script
 * Directly validates agent outputs against source data
 *
 * Run with: node scripts/dataValidation.mjs
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

// Store all data for validation
const allRecords = [];
const byLob = new Map();
const byCarrier = new Map();

async function loadData() {
  console.log('Loading data from Firestore...\n');
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  snapshot.forEach((doc) => {
    const data = doc.data();
    const status = (data.appetite_status || 'no').toLowerCase();
    if (status === 'no') return;

    const record = {
      carrier: data.carrier_raw || '',
      carrier_key: (data.carrier_key || '').toLowerCase(),
      lob: data.lob_raw || '',
      lob_key: (data.lob_key || '').toLowerCase(),
      state: data.state_raw || '',
      status: status,
      known_for: data.known_for || '',
    };

    allRecords.push(record);

    // Index by LOB
    if (!byLob.has(record.lob_key)) {
      byLob.set(record.lob_key, []);
    }
    byLob.get(record.lob_key).push(record);

    // Index by carrier
    if (!byCarrier.has(record.carrier_key)) {
      byCarrier.set(record.carrier_key, []);
    }
    byCarrier.get(record.carrier_key).push(record);
  });

  console.log(`Loaded ${allRecords.length} records with positive appetite`);
  console.log(`Unique LOBs: ${byLob.size}`);
  console.log(`Unique Carriers: ${byCarrier.size}\n`);
}

// ============================================================================
// SPECIFIC VALIDATION TESTS
// ============================================================================

function validateSpecificCases() {
  console.log('='.repeat(70));
  console.log('  SPECIFIC DATA VALIDATION TESTS');
  console.log('='.repeat(70) + '\n');

  const results = [];

  // Test 1: Verify homeowners carriers
  console.log('TEST 1: Homeowners carriers count');
  const homeownersRecords = byLob.get('homeowners') || [];
  const homeownersCarriers = new Set(homeownersRecords.map(r => r.carrier_key));
  console.log(`  Expected: Multiple carriers for homeowners`);
  console.log(`  Found: ${homeownersCarriers.size} unique carriers`);
  console.log(`  Sample: ${Array.from(homeownersCarriers).slice(0, 5).join(', ')}`);
  results.push({
    test: 'Homeowners carriers',
    passed: homeownersCarriers.size >= 50,
    expected: '>=50',
    actual: homeownersCarriers.size
  });

  // Test 2: Verify specific carrier has correct LOBs
  console.log('\nTEST 2: Aegis carrier LOBs');
  const aegisRecords = byCarrier.get('aegis') || [];
  const aegisLobs = new Set(aegisRecords.map(r => r.lob_key));
  console.log(`  Aegis LOBs: ${aegisLobs.size}`);
  console.log(`  Sample: ${Array.from(aegisLobs).slice(0, 10).join(', ')}`);
  const aegisExpectedLobs = ['homeowners', 'landlord', 'manufactured homes'];
  const hasExpectedLobs = aegisExpectedLobs.filter(lob =>
    Array.from(aegisLobs).some(l => l.includes(lob) || lob.includes(l))
  );
  console.log(`  Has expected LOBs: ${hasExpectedLobs.join(', ')}`);
  results.push({
    test: 'Aegis has expected LOBs',
    passed: hasExpectedLobs.length >= 2,
    expected: 'homeowners, landlord, manufactured homes',
    actual: hasExpectedLobs.join(', ')
  });

  // Test 3: Verify Texas carriers
  console.log('\nTEST 3: Texas carrier coverage');
  const txCarriers = new Set();
  allRecords.forEach(r => {
    const stateUpper = r.state.toUpperCase();
    if (stateUpper.includes('TX') || stateUpper.includes('ALL STATES') || stateUpper.includes('ALL 50')) {
      txCarriers.add(r.carrier_key);
    }
  });
  console.log(`  Carriers operating in TX: ${txCarriers.size}`);
  console.log(`  Sample: ${Array.from(txCarriers).slice(0, 8).join(', ')}`);
  results.push({
    test: 'TX carriers count',
    passed: txCarriers.size >= 40,
    expected: '>=40',
    actual: txCarriers.size
  });

  // Test 4: Verify flood insurance availability
  console.log('\nTEST 4: Flood insurance carriers');
  const floodRecords = byLob.get('flood') || [];
  const floodCarriers = new Set(floodRecords.map(r => r.carrier_key));
  console.log(`  Flood carriers: ${floodCarriers.size}`);
  console.log(`  Carriers: ${Array.from(floodCarriers).slice(0, 10).join(', ')}`);
  results.push({
    test: 'Flood carriers available',
    passed: floodCarriers.size >= 10,
    expected: '>=10',
    actual: floodCarriers.size
  });

  // Test 5: Verify umbrella coverage
  console.log('\nTEST 5: Umbrella coverage carriers');
  const umbrellaRecords = byLob.get('umbrella') || [];
  const umbrellaCarriers = new Set(umbrellaRecords.map(r => r.carrier_key));
  console.log(`  Umbrella carriers: ${umbrellaCarriers.size}`);
  console.log(`  Carriers: ${Array.from(umbrellaCarriers).slice(0, 10).join(', ')}`);
  results.push({
    test: 'Umbrella carriers available',
    passed: umbrellaCarriers.size >= 10,
    expected: '>=10',
    actual: umbrellaCarriers.size
  });

  // Test 6: Verify BOP coverage
  console.log('\nTEST 6: BOP (Business Owners Policy) carriers');
  const bopRecords = byLob.get('bop') || [];
  const bopCarriers = new Set(bopRecords.map(r => r.carrier_key));
  console.log(`  BOP carriers: ${bopCarriers.size}`);
  if (bopCarriers.size === 0) {
    // Try packaged
    const packagedRecords = allRecords.filter(r =>
      r.lob_key.includes('packaged') || r.lob_key.includes('business owners')
    );
    const packagedCarriers = new Set(packagedRecords.map(r => r.carrier_key));
    console.log(`  Packaged/Business Owners carriers: ${packagedCarriers.size}`);
    results.push({
      test: 'BOP/Packaged carriers available',
      passed: packagedCarriers.size >= 5,
      expected: '>=5',
      actual: packagedCarriers.size
    });
  } else {
    results.push({
      test: 'BOP carriers available',
      passed: bopCarriers.size >= 5,
      expected: '>=5',
      actual: bopCarriers.size
    });
  }

  // Test 7: Verify commercial lines presence
  console.log('\nTEST 7: Commercial lines coverage');
  const commercialLobs = ['commercial auto', 'workers comp', 'general liability', 'commercial property'];
  const commercialCoverage = {};
  for (const lob of commercialLobs) {
    const records = allRecords.filter(r => r.lob_key.includes(lob.replace(' ', '')));
    commercialCoverage[lob] = new Set(records.map(r => r.carrier_key)).size;
  }
  console.log('  Commercial LOB carrier counts:');
  Object.entries(commercialCoverage).forEach(([lob, count]) => {
    console.log(`    ${lob}: ${count} carriers`);
  });
  const totalCommercial = Object.values(commercialCoverage).reduce((a, b) => a + b, 0);
  results.push({
    test: 'Commercial lines coverage',
    passed: totalCommercial >= 10,
    expected: '>=10 total',
    actual: totalCommercial
  });

  // Test 8: Verify high-appetite carriers have multiple LOBs
  console.log('\nTEST 8: Multi-LOB carriers');
  const carrierLobCount = new Map();
  byCarrier.forEach((records, carrier) => {
    const lobs = new Set(records.map(r => r.lob_key));
    carrierLobCount.set(carrier, lobs.size);
  });
  const multiLobCarriers = Array.from(carrierLobCount.entries())
    .filter(([_, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log('  Top multi-LOB carriers:');
  multiLobCarriers.forEach(([carrier, count]) => {
    const raw = byCarrier.get(carrier)?.[0]?.carrier || carrier;
    console.log(`    ${raw}: ${count} LOBs`);
  });
  results.push({
    test: 'Multi-LOB carriers exist',
    passed: multiLobCarriers.length >= 5,
    expected: '>=5 carriers with 10+ LOBs',
    actual: multiLobCarriers.length
  });

  // Test 9: Verify conditional appetite handling
  console.log('\nTEST 9: Conditional appetite records');
  const conditionalRecords = allRecords.filter(r => r.status === 'conditional');
  console.log(`  Conditional records: ${conditionalRecords.length}`);
  console.log(`  Sample carriers with conditional:`,
    Array.from(new Set(conditionalRecords.map(r => r.carrier))).slice(0, 5).join(', ')
  );
  results.push({
    test: 'Conditional appetite present',
    passed: conditionalRecords.length > 0,
    expected: '>0',
    actual: conditionalRecords.length
  });

  // Test 10: Verify known_for field population
  console.log('\nTEST 10: Known For field population');
  const withKnownFor = allRecords.filter(r => r.known_for && r.known_for.length > 0);
  console.log(`  Records with known_for: ${withKnownFor.length} / ${allRecords.length}`);
  console.log(`  Sample known_for values:`);
  const uniqueKnownFor = new Set(withKnownFor.map(r => r.known_for));
  Array.from(uniqueKnownFor).slice(0, 5).forEach(kf => {
    console.log(`    - ${kf.substring(0, 60)}${kf.length > 60 ? '...' : ''}`);
  });
  results.push({
    test: 'Known_for populated',
    passed: withKnownFor.length > 0,
    expected: '>0',
    actual: withKnownFor.length
  });

  return results;
}

// ============================================================================
// CROSS-VALIDATION TESTS
// ============================================================================

function crossValidateAgentLogic() {
  console.log('\n' + '='.repeat(70));
  console.log('  AGENT LOGIC CROSS-VALIDATION');
  console.log('='.repeat(70) + '\n');

  const validations = [];

  // Validation 1: Query "homeowners TX" should find carriers with both criteria
  console.log('VALIDATION 1: "homeowners in TX" query logic');
  const homeownersRecords = byLob.get('homeowners') || [];
  const txHomeowners = homeownersRecords.filter(r => {
    const stateUpper = r.state.toUpperCase();
    return stateUpper.includes('TX') || stateUpper.includes('ALL STATES') || stateUpper.includes('ALL 50') || !r.state;
  });
  const txHomeownersCarriers = new Set(txHomeowners.map(r => r.carrier_key));
  console.log(`  Carriers with homeowners appetite in TX: ${txHomeownersCarriers.size}`);
  console.log(`  Top 5: ${Array.from(txHomeownersCarriers).slice(0, 5).join(', ')}`);
  validations.push({
    query: 'homeowners TX',
    expectedMin: 30,
    actual: txHomeownersCarriers.size,
    passed: txHomeownersCarriers.size >= 30
  });

  // Validation 2: Query "landlord CA" should find DP3/dwelling carriers
  console.log('\nVALIDATION 2: "landlord in CA" query logic');
  const landlordKeys = ['landlord', 'dp3', 'dwelling fire'];
  const caLandlord = allRecords.filter(r => {
    const lobMatch = landlordKeys.some(k => r.lob_key.includes(k));
    const stateUpper = r.state.toUpperCase();
    const stateMatch = stateUpper.includes('CA') || stateUpper.includes('ALL STATES') || stateUpper.includes('ALL 50') || !r.state;
    return lobMatch && stateMatch;
  });
  const caLandlordCarriers = new Set(caLandlord.map(r => r.carrier_key));
  console.log(`  Carriers with landlord/DP3 appetite in CA: ${caLandlordCarriers.size}`);
  console.log(`  Top 5: ${Array.from(caLandlordCarriers).slice(0, 5).join(', ')}`);
  validations.push({
    query: 'landlord CA',
    expectedMin: 20,
    actual: caLandlordCarriers.size,
    passed: caLandlordCarriers.size >= 20
  });

  // Validation 3: Query "flood FL"
  console.log('\nVALIDATION 3: "flood in FL" query logic');
  const floodRecords = byLob.get('flood') || [];
  const flFlood = floodRecords.filter(r => {
    const stateUpper = r.state.toUpperCase();
    return stateUpper.includes('FL') || stateUpper.includes('ALL STATES') || stateUpper.includes('ALL 50') || !r.state;
  });
  const flFloodCarriers = new Set(flFlood.map(r => r.carrier_key));
  console.log(`  Carriers with flood appetite in FL: ${flFloodCarriers.size}`);
  console.log(`  Carriers: ${Array.from(flFloodCarriers).slice(0, 8).join(', ')}`);
  validations.push({
    query: 'flood FL',
    expectedMin: 10,
    actual: flFloodCarriers.size,
    passed: flFloodCarriers.size >= 10
  });

  // Validation 4: Query "manufactured homes AZ"
  console.log('\nVALIDATION 4: "manufactured homes in AZ" query logic');
  const mfgRecords = allRecords.filter(r => r.lob_key.includes('manufactured'));
  const azMfg = mfgRecords.filter(r => {
    const stateUpper = r.state.toUpperCase();
    return stateUpper.includes('AZ') || stateUpper.includes('ALL STATES') || stateUpper.includes('ALL 50') || !r.state;
  });
  const azMfgCarriers = new Set(azMfg.map(r => r.carrier_key));
  console.log(`  Carriers with manufactured homes appetite in AZ: ${azMfgCarriers.size}`);
  console.log(`  Carriers: ${Array.from(azMfgCarriers).slice(0, 8).join(', ')}`);
  // Check if Aegis is present (known manufactured homes specialist)
  const aegisFound = azMfgCarriers.has('aegis');
  console.log(`  Aegis (specialist) found: ${aegisFound ? 'YES' : 'NO'}`);
  validations.push({
    query: 'manufactured homes AZ',
    expectedMin: 10,
    actual: azMfgCarriers.size,
    passed: azMfgCarriers.size >= 10 && aegisFound
  });

  return validations;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  DATA VALIDATION AND VERIFICATION');
  console.log('█'.repeat(70) + '\n');

  await loadData();

  const specificResults = validateSpecificCases();
  const crossValidations = crossValidateAgentLogic();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  VALIDATION SUMMARY');
  console.log('='.repeat(70) + '\n');

  console.log('SPECIFIC DATA TESTS:');
  let passedSpecific = 0;
  specificResults.forEach(r => {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} - ${r.test} (expected: ${r.expected}, actual: ${r.actual})`);
    if (r.passed) passedSpecific++;
  });
  console.log(`\n  Passed: ${passedSpecific}/${specificResults.length}`);

  console.log('\nCROSS-VALIDATION TESTS:');
  let passedCross = 0;
  crossValidations.forEach(v => {
    const status = v.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} - Query "${v.query}" (expected: >=${v.expectedMin}, actual: ${v.actual})`);
    if (v.passed) passedCross++;
  });
  console.log(`\n  Passed: ${passedCross}/${crossValidations.length}`);

  const totalPassed = passedSpecific + passedCross;
  const totalTests = specificResults.length + crossValidations.length;
  console.log('\n' + '─'.repeat(70));
  console.log(`TOTAL: ${totalPassed}/${totalTests} tests passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
  console.log('─'.repeat(70) + '\n');

  process.exit(totalPassed === totalTests ? 0 : 1);
}

main();
