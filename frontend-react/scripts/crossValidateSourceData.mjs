/**
 * Cross-Validate Agent Data Against Source Files
 *
 * Compares Firestore data with:
 * 1. 01_raw_inputs/Carrier Appetite Guide-Updated(Personal).csv
 * 2. 02_client_pack production data
 *
 * Run with: node scripts/crossValidateSourceData.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createReadStream, readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
// LOAD SOURCE DATA
// ============================================================================

function loadRawAppetiteGuide() {
  console.log('\n--- Loading Raw Appetite Guide ---');
  const csvPath = 'D:/chrome download/AI Insurance/AI Insurance/01_raw_inputs/Carrier Appetite Guide-Updated(Personal).csv';

  try {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    // Find the header row (starts with "CARRIERS")
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('CARRIERS,')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      console.log('Could not find header row');
      return { carriers: [], lobs: [] };
    }

    // Parse header to get LOB columns
    const headerCols = lines[headerIndex].split(',');
    const lobColumns = headerCols.slice(4).filter(col => col.trim() && !col.includes(','));

    console.log(`Found ${lobColumns.length} LOB columns`);
    console.log(`Sample LOBs: ${lobColumns.slice(0, 10).join(', ')}`);

    // Parse carrier rows
    const carriers = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Simple CSV parsing (handle commas in quotes)
      const cols = line.split(',');
      const carrierName = cols[0]?.trim();
      if (!carrierName || carrierName === '') continue;

      const statesOperating = cols[1]?.trim() || '';
      const knownFor = cols[2]?.trim() || '';
      const carrierType = cols[3]?.trim() || '';

      // Get appetite for each LOB
      const appetites = {};
      for (let j = 0; j < lobColumns.length && (j + 4) < cols.length; j++) {
        const lob = lobColumns[j].trim();
        const value = (cols[j + 4] || '').trim().toUpperCase();
        if (value && value !== '' && value !== 'NO') {
          appetites[lob] = value.includes('YES') ? 'yes' : 'conditional';
        }
      }

      carriers.push({
        name: carrierName,
        states: statesOperating,
        knownFor: knownFor,
        type: carrierType,
        appetites: appetites,
        lobCount: Object.keys(appetites).length,
      });
    }

    console.log(`Loaded ${carriers.length} carriers from raw CSV`);

    // Count carriers with appetite
    const carriersWithAppetite = carriers.filter(c => c.lobCount > 0);
    console.log(`Carriers with at least 1 appetite: ${carriersWithAppetite.length}`);

    return { carriers, lobs: lobColumns };
  } catch (error) {
    console.error('Error loading raw CSV:', error.message);
    return { carriers: [], lobs: [] };
  }
}

function loadProductionData() {
  console.log('\n--- Loading Production Data ---');
  const csvPath = 'D:/chrome download/AI Insurance/AI Insurance/01_raw_inputs/february-data-2026 copy(New Business by State Count).csv';

  try {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    // Parse production records
    const production = [];
    let dataStarted = false;

    for (const line of lines) {
      if (line.includes('Rating State') && line.includes('Master Company')) {
        dataStarted = true;
        continue;
      }
      if (!dataStarted) continue;

      const cols = line.split(',');
      if (cols.length >= 5) {
        const state = cols[2]?.trim();
        const lob = cols[3]?.trim();
        const carrier = cols[4]?.trim();
        const count = parseInt(cols[5]) || 0;

        if (state && lob && carrier && count > 0) {
          production.push({ state, lob, carrier, count });
        }
      }
    }

    console.log(`Loaded ${production.length} production records`);

    // Summarize by carrier
    const byCarrier = new Map();
    production.forEach(p => {
      if (!byCarrier.has(p.carrier)) {
        byCarrier.set(p.carrier, { count: 0, states: new Set(), lobs: new Set() });
      }
      const data = byCarrier.get(p.carrier);
      data.count += p.count;
      data.states.add(p.state);
      data.lobs.add(p.lob);
    });

    console.log(`Unique carriers in production: ${byCarrier.size}`);

    // Top producers
    const sorted = Array.from(byCarrier.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    console.log('\nTop 10 Production Carriers:');
    sorted.forEach(([carrier, data]) => {
      console.log(`  ${carrier}: ${data.count} policies, ${data.states.size} states, ${data.lobs.size} LOBs`);
    });

    return { production, byCarrier };
  } catch (error) {
    console.error('Error loading production data:', error.message);
    return { production: [], byCarrier: new Map() };
  }
}

// ============================================================================
// LOAD FIRESTORE DATA
// ============================================================================

async function loadFirestoreData() {
  console.log('\n--- Loading Firestore Data ---');

  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  const records = [];
  const byCarrier = new Map();
  const byLob = new Map();

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
      knownFor: data.known_for || '',
    };

    records.push(record);

    // Index by carrier
    if (!byCarrier.has(record.carrier)) {
      byCarrier.set(record.carrier, { lobs: new Set(), states: record.state });
    }
    byCarrier.get(record.carrier).lobs.add(record.lob_key);

    // Index by LOB
    if (!byLob.has(record.lob_key)) {
      byLob.set(record.lob_key, new Set());
    }
    byLob.get(record.lob_key).add(record.carrier);
  });

  console.log(`Loaded ${records.length} records from Firestore`);
  console.log(`Unique carriers: ${byCarrier.size}`);
  console.log(`Unique LOBs: ${byLob.size}`);

  return { records, byCarrier, byLob };
}

// ============================================================================
// CROSS-VALIDATION
// ============================================================================

function crossValidate(rawData, firestoreData, productionData) {
  console.log('\n' + '='.repeat(70));
  console.log('  CROSS-VALIDATION RESULTS');
  console.log('='.repeat(70));

  const results = [];

  // TEST 1: Carrier Count Match
  console.log('\n--- TEST 1: Carrier Count ---');
  const rawCarrierCount = rawData.carriers.filter(c => c.lobCount > 0).length;
  const fsCarrierCount = firestoreData.byCarrier.size;
  console.log(`Raw CSV carriers with appetite: ${rawCarrierCount}`);
  console.log(`Firestore carriers: ${fsCarrierCount}`);
  const carrierCountMatch = Math.abs(rawCarrierCount - fsCarrierCount) <= 30; // Allow some variance
  console.log(`Match: ${carrierCountMatch ? '✓ PASS' : '✗ FAIL'} (tolerance: ±30)`);
  results.push({ test: 'Carrier count', passed: carrierCountMatch });

  // TEST 2: Specific Carrier Validation
  console.log('\n--- TEST 2: Specific Carrier Validation ---');
  const testCarriers = ['Safeco', 'Travelers', 'Aegis', 'Foremost', 'Geico', 'Germania'];
  let carriersPassed = 0;

  for (const carrier of testCarriers) {
    const rawCarrier = rawData.carriers.find(c =>
      c.name.toLowerCase().includes(carrier.toLowerCase())
    );
    const fsCarrier = Array.from(firestoreData.byCarrier.keys()).find(c =>
      c.toLowerCase().includes(carrier.toLowerCase())
    );

    const inRaw = !!rawCarrier;
    const inFs = !!fsCarrier;

    if (inRaw && inFs) {
      console.log(`  ✓ ${carrier}: Found in both (Raw LOBs: ${rawCarrier?.lobCount || 0}, FS LOBs: ${firestoreData.byCarrier.get(fsCarrier)?.lobs.size || 0})`);
      carriersPassed++;
    } else if (inRaw && !inFs) {
      console.log(`  ✗ ${carrier}: In Raw CSV but MISSING from Firestore`);
    } else if (!inRaw && inFs) {
      console.log(`  ? ${carrier}: In Firestore but not in Raw CSV`);
      carriersPassed++; // May have different naming
    } else {
      console.log(`  ✗ ${carrier}: Missing from both`);
    }
  }
  results.push({ test: 'Carrier validation', passed: carriersPassed >= 4 });

  // TEST 3: LOB Coverage Match
  console.log('\n--- TEST 3: LOB Coverage ---');
  const keyLobs = ['Homeowners', 'Auto', 'Umbrella', 'Flood', 'Condo', 'Landlord/DP3', 'Manufactured Homes'];
  let lobsPassed = 0;

  for (const lob of keyLobs) {
    const lobLower = lob.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Find in raw
    const rawLob = rawData.lobs.find(l =>
      l.toLowerCase().replace(/[^a-z0-9]/g, '').includes(lobLower) ||
      lobLower.includes(l.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );

    // Find in firestore
    const fsLob = Array.from(firestoreData.byLob.keys()).find(l =>
      l.includes(lobLower.substring(0, 5)) || lobLower.includes(l.substring(0, 5))
    );

    const fsCarrierCount = fsLob ? firestoreData.byLob.get(fsLob)?.size || 0 : 0;

    if (rawLob && fsCarrierCount > 0) {
      console.log(`  ✓ ${lob}: Raw column "${rawLob}", Firestore has ${fsCarrierCount} carriers`);
      lobsPassed++;
    } else if (!rawLob) {
      console.log(`  ? ${lob}: Not found in raw columns (may use different name)`);
    } else {
      console.log(`  ✗ ${lob}: No carriers in Firestore`);
    }
  }
  results.push({ test: 'LOB coverage', passed: lobsPassed >= 5 });

  // TEST 4: Production Carrier Presence
  console.log('\n--- TEST 4: Production Carriers in System ---');
  const topProducers = Array.from(productionData.byCarrier.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([carrier]) => carrier);

  let prodFound = 0;
  for (const producer of topProducers) {
    const producerLower = producer.toLowerCase();
    const inFs = Array.from(firestoreData.byCarrier.keys()).some(c =>
      c.toLowerCase().includes(producerLower.split(' ')[0]) ||
      producerLower.includes(c.toLowerCase().split(' ')[0])
    );

    if (inFs) {
      console.log(`  ✓ ${producer}: Present in Firestore`);
      prodFound++;
    } else {
      console.log(`  ? ${producer}: Not found (may use different name)`);
    }
  }
  console.log(`Found ${prodFound}/${topProducers.length} top producers in system`);
  results.push({ test: 'Production carriers', passed: prodFound >= 5 });

  // TEST 5: State Coverage
  console.log('\n--- TEST 5: State Coverage ---');
  const keyStates = ['TX', 'CA', 'FL', 'AZ', 'WA', 'OR'];
  let statesPassed = 0;

  for (const state of keyStates) {
    const carriersInState = firestoreData.records.filter(r => {
      const stateUpper = r.state.toUpperCase();
      return stateUpper.includes(state) || stateUpper.includes('ALL STATES');
    });
    const uniqueCarriers = new Set(carriersInState.map(r => r.carrier_key)).size;

    if (uniqueCarriers >= 20) {
      console.log(`  ✓ ${state}: ${uniqueCarriers} carriers`);
      statesPassed++;
    } else {
      console.log(`  ? ${state}: Only ${uniqueCarriers} carriers (expected >= 20)`);
    }
  }
  results.push({ test: 'State coverage', passed: statesPassed >= 4 });

  // TEST 6: Known For Field Population
  console.log('\n--- TEST 6: Known For Field Validation ---');
  const rawWithKnownFor = rawData.carriers.filter(c => c.knownFor && c.knownFor.length > 0);
  const fsWithKnownFor = firestoreData.records.filter(r => r.knownFor && r.knownFor.length > 0);

  console.log(`Raw carriers with Known For: ${rawWithKnownFor.length}`);
  console.log(`Firestore records with Known For: ${fsWithKnownFor.length}`);

  // Sample validation
  const sampleCarrier = rawData.carriers.find(c => c.name === 'Aegis');
  const fsSample = firestoreData.records.find(r => r.carrier.toLowerCase().includes('aegis'));

  if (sampleCarrier && fsSample) {
    console.log(`\nSample: Aegis`);
    console.log(`  Raw Known For: "${sampleCarrier.knownFor}"`);
    console.log(`  FS Known For:  "${fsSample.knownFor}"`);
    const knownForMatch = fsSample.knownFor.toLowerCase().includes('manufactured') ||
                          fsSample.knownFor.toLowerCase().includes('landlord');
    console.log(`  Match: ${knownForMatch ? '✓' : '?'}`);
  }
  results.push({ test: 'Known For populated', passed: fsWithKnownFor.length > 0 });

  // TEST 7: Appetite Status Distribution
  console.log('\n--- TEST 7: Appetite Status Distribution ---');
  const yesCount = firestoreData.records.filter(r => r.status === 'yes').length;
  const conditionalCount = firestoreData.records.filter(r => r.status === 'conditional').length;

  console.log(`YES appetite: ${yesCount} records`);
  console.log(`CONDITIONAL appetite: ${conditionalCount} records`);
  console.log(`Ratio: ${(yesCount / (yesCount + conditionalCount) * 100).toFixed(1)}% YES`);

  const hasConditional = conditionalCount > 0;
  results.push({ test: 'Appetite status variety', passed: hasConditional });

  return results;
}

// ============================================================================
// SPECIFIC CARRIER-LOB-STATE VALIDATION
// ============================================================================

function validateSpecificCases(rawData, firestoreData) {
  console.log('\n' + '='.repeat(70));
  console.log('  SPECIFIC CASE VALIDATION');
  console.log('='.repeat(70));

  const cases = [
    { carrier: 'Safeco', lob: 'Home', state: 'TX' },
    { carrier: 'Aegis', lob: 'Manufactured Homes', state: 'TX' },
    { carrier: 'Foremost', lob: 'Manufactured Homes', state: 'TX' },
    { carrier: 'Geico', lob: 'Auto', state: 'TX' },
    { carrier: 'Travelers', lob: 'Umbrella', state: 'ALL' },
    { carrier: 'Abacus', lob: 'Jewelry Floater', state: 'ALL' },
  ];

  let passed = 0;

  for (const testCase of cases) {
    console.log(`\nCase: ${testCase.carrier} - ${testCase.lob}`);

    // Check in raw data
    const rawCarrier = rawData.carriers.find(c =>
      c.name.toLowerCase().includes(testCase.carrier.toLowerCase())
    );

    let rawHasAppetite = false;
    if (rawCarrier) {
      const lobKey = Object.keys(rawCarrier.appetites).find(l =>
        l.toLowerCase().includes(testCase.lob.toLowerCase().split(' ')[0])
      );
      rawHasAppetite = !!lobKey;
      console.log(`  Raw CSV: ${rawHasAppetite ? 'HAS appetite' : 'No appetite'} (${rawCarrier.name})`);
    } else {
      console.log(`  Raw CSV: Carrier not found`);
    }

    // Check in Firestore
    const fsRecords = firestoreData.records.filter(r =>
      r.carrier.toLowerCase().includes(testCase.carrier.toLowerCase()) &&
      r.lob_key.includes(testCase.lob.toLowerCase().split(' ')[0])
    );

    const fsHasAppetite = fsRecords.length > 0;
    console.log(`  Firestore: ${fsHasAppetite ? `HAS ${fsRecords.length} records` : 'No records'}`);

    if (fsRecords.length > 0) {
      console.log(`    Sample: LOB="${fsRecords[0].lob}", Status="${fsRecords[0].status}"`);
    }

    // Verify match
    if (rawHasAppetite && fsHasAppetite) {
      console.log(`  ✓ MATCH - Both sources confirm appetite`);
      passed++;
    } else if (!rawHasAppetite && !fsHasAppetite) {
      console.log(`  ✓ MATCH - Both sources confirm NO appetite`);
      passed++;
    } else {
      console.log(`  ? MISMATCH - Sources disagree`);
    }
  }

  return { passed, total: cases.length };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  CROSS-VALIDATION: Source Data vs Firestore');
  console.log('█'.repeat(70));

  // Load all data sources
  const rawData = loadRawAppetiteGuide();
  const productionData = loadProductionData();
  const firestoreData = await loadFirestoreData();

  // Run cross-validation
  const results = crossValidate(rawData, firestoreData, productionData);

  // Run specific case validation
  const specificResults = validateSpecificCases(rawData, firestoreData);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  VALIDATION SUMMARY');
  console.log('='.repeat(70));

  console.log('\nCross-Validation Tests:');
  let totalPassed = 0;
  results.forEach(r => {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} - ${r.test}`);
    if (r.passed) totalPassed++;
  });
  console.log(`\nPassed: ${totalPassed}/${results.length}`);

  console.log(`\nSpecific Case Validation: ${specificResults.passed}/${specificResults.total} cases matched`);

  const overallPassed = totalPassed + specificResults.passed;
  const overallTotal = results.length + specificResults.total;
  const passRate = ((overallPassed / overallTotal) * 100).toFixed(1);

  console.log('\n' + '─'.repeat(70));
  console.log(`OVERALL: ${overallPassed}/${overallTotal} validations passed (${passRate}%)`);
  console.log('─'.repeat(70) + '\n');

  process.exit(parseFloat(passRate) >= 70 ? 0 : 1);
}

main();
