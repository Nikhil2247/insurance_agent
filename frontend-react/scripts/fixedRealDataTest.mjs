/**
 * Fixed Real Data Agent Test
 *
 * Tests agent with exact LOB keys from Firestore
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

// Load Firestore data
async function loadFirestoreData() {
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
      lob_key: (data.lob_key || '').toLowerCase(),
      lob_raw: data.lob_raw || '',
      state: data.state_raw || '',
      status: status,
    });
  });

  return records;
}

// Load raw CSV data
function loadRawData() {
  const csvPath = 'D:/chrome download/AI Insurance/AI Insurance/01_raw_inputs/Carrier Appetite Guide-Updated(Personal).csv';
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('CARRIERS,')) {
      headerIndex = i;
      break;
    }
  }

  const headerCols = lines[headerIndex].split(',');
  const lobMap = {};
  for (let i = 4; i < headerCols.length; i++) {
    const col = headerCols[i].trim();
    if (col) lobMap[i] = col;
  }

  const carriers = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[0]?.trim();
    if (!name) continue;

    const appetites = {};
    for (const [idx, lobName] of Object.entries(lobMap)) {
      const val = (cols[idx] || '').trim().toUpperCase();
      if (val && !val.startsWith('NO') && val !== '') {
        appetites[lobName] = val.includes('YES') ? 'yes' : 'conditional';
      }
    }

    carriers.push({
      name,
      states: cols[1]?.trim() || '',
      knownFor: cols[2]?.trim() || '',
      appetites
    });
  }

  return carriers;
}

// Agent query simulation (using exact LOB keys)
function queryAgent(records, state, lobKey) {
  const stateUpper = state.toUpperCase();

  const matches = records.filter(r => {
    // Exact LOB key match
    if (r.lob_key !== lobKey.toLowerCase()) return false;

    // State match
    const stateRaw = (r.state || '').toUpperCase();
    return !state ||
           stateRaw.includes(stateUpper) ||
           stateRaw.includes('ALL STATES') ||
           stateRaw.includes('ALL 50') ||
           stateRaw.includes('CBIG') ||
           !r.state;
  });

  // Remove duplicates
  const seen = new Set();
  return matches.filter(r => {
    if (seen.has(r.carrier_key)) return false;
    seen.add(r.carrier_key);
    return true;
  });
}

// Create test cases from actual raw data + Firestore mapping
function createTestCases(rawCarriers, fsRecords) {
  const testCases = [];

  // Map raw LOB names to Firestore lob_keys
  const lobMapping = {
    'Home': 'homeowners',
    'HO3': 'ho3',
    'Auto': 'auto',
    'Condo': 'condo',
    'Umbrella': 'umbrella',
    'Flood': 'flood',
    'Landlord/DP3': 'landlord',
    'Manufactured Homes': 'manufactured homes',
    'Jewelry Floater': 'jewelry floater',
    'Renters HO4': 'renters',
  };

  // Test specific carriers from raw data
  const testCarriers = [
    { rawName: 'Safeco', lob: 'Home', state: 'TX' },
    { rawName: 'Geico', lob: 'Auto', state: 'TX' },
    { rawName: 'Germania', lob: 'Umbrella', state: 'TX' },
    { rawName: 'Aegis', lob: 'Manufactured Homes', state: 'AZ' },
    { rawName: 'Abacus', lob: 'Jewelry Floater', state: 'CA' },
    { rawName: 'Access One80 (Bigfoot)', lob: 'Flood', state: 'FL' },
    { rawName: 'American Modern', lob: 'Condo', state: 'FL' },
    { rawName: 'Orion 180', lob: 'Home', state: 'TX' },
  ];

  for (const tc of testCarriers) {
    const rawCarrier = rawCarriers.find(c => c.name.includes(tc.rawName.split(' ')[0]));
    if (!rawCarrier) continue;

    const hasAppetite = rawCarrier.appetites[tc.lob];
    if (!hasAppetite) continue;

    const fsLobKey = lobMapping[tc.lob] || tc.lob.toLowerCase();

    testCases.push({
      description: `${tc.rawName} - ${tc.lob} in ${tc.state}`,
      carrier: tc.rawName,
      rawLob: tc.lob,
      fsLobKey: fsLobKey,
      state: tc.state,
      rawAppetite: hasAppetite,
      rawStates: rawCarrier.states,
    });
  }

  return testCases;
}

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  REAL DATA AGENT VERIFICATION');
  console.log('█'.repeat(70));

  // Load data
  console.log('\n--- Loading Data ---');
  const fsRecords = await loadFirestoreData();
  const rawCarriers = loadRawData();
  console.log(`Firestore: ${fsRecords.length} records`);
  console.log(`Raw CSV: ${rawCarriers.length} carriers`);

  // Create test cases
  const testCases = createTestCases(rawCarriers, fsRecords);
  console.log(`\nCreated ${testCases.length} test cases\n`);

  // Run tests
  console.log('='.repeat(70));
  console.log('  RUNNING TESTS');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`\n--- ${tc.description} ---`);
    console.log(`Raw Data: ${tc.rawLob} = ${tc.rawAppetite}`);
    console.log(`Raw States: ${tc.rawStates.substring(0, 50)}...`);
    console.log(`Query: lob_key="${tc.fsLobKey}", state="${tc.state}"`);

    // Query agent
    const results = queryAgent(fsRecords, tc.state, tc.fsLobKey);

    // Find expected carrier
    const carrierLower = tc.carrier.toLowerCase().split(' ')[0];
    const found = results.find(r =>
      r.carrier.toLowerCase().includes(carrierLower) ||
      r.carrier_key.includes(carrierLower)
    );

    console.log(`\nAgent Results (${results.length} carriers):`);
    results.slice(0, 5).forEach((r, i) => {
      const marker = r === found ? '>>>' : '   ';
      console.log(`  ${marker} ${i+1}. ${r.carrier} | ${r.status}`);
    });

    if (found) {
      const position = results.indexOf(found) + 1;
      const inTop3 = position <= 3;
      console.log(`\n✓ FOUND: ${found.carrier} at position ${position}${inTop3 ? ' (TOP 3)' : ''}`);
      console.log(`  Appetite match: Raw=${tc.rawAppetite} vs FS=${found.status}`);
      passed++;
    } else {
      console.log(`\n✗ NOT FOUND: ${tc.carrier}`);

      // Debug: check if carrier exists at all
      const allCarrierRecords = fsRecords.filter(r =>
        r.carrier.toLowerCase().includes(carrierLower) ||
        r.carrier_key.includes(carrierLower)
      );

      if (allCarrierRecords.length > 0) {
        console.log(`  Debug: Carrier exists with ${allCarrierRecords.length} total records`);
        const lobMatch = allCarrierRecords.find(r => r.lob_key === tc.fsLobKey);
        if (lobMatch) {
          console.log(`  Debug: LOB match found: ${lobMatch.lob_key}`);
          console.log(`  Debug: State data: "${lobMatch.state.substring(0, 60)}"`);
          console.log(`  Debug: State ${tc.state} included? ${lobMatch.state.toUpperCase().includes(tc.state)}`);
        } else {
          console.log(`  Debug: NO LOB match for "${tc.fsLobKey}"`);
          console.log(`  Debug: Available LOBs: ${[...new Set(allCarrierRecords.map(r => r.lob_key))].join(', ')}`);
        }
      } else {
        console.log(`  Debug: Carrier NOT in Firestore at all`);
      }

      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nPassed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  console.log(`Pass Rate: ${((passed/testCases.length)*100).toFixed(0)}%`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
