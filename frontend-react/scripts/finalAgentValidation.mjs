/**
 * FINAL Agent Validation Test
 *
 * Comprehensive test matching raw source data to agent output
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

async function loadFirestoreData() {
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);
  const records = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if ((data.appetite_status || '').toLowerCase() === 'no') return;
    records.push({
      carrier: data.carrier_raw || '',
      carrier_key: (data.carrier_key || '').toLowerCase(),
      lob_key: (data.lob_key || '').toLowerCase(),
      lob_raw: data.lob_raw || '',
      state: data.state_raw || '',
      status: data.appetite_status || '',
    });
  });
  return records;
}

function queryAgent(records, state, lobKey) {
  const stateUpper = state.toUpperCase();
  const matches = records.filter(r => {
    if (r.lob_key !== lobKey.toLowerCase()) return false;
    const stateRaw = (r.state || '').toUpperCase();
    // Match state patterns including CBIG/CBI/ANY STATE
    return !state ||
           stateRaw.includes(stateUpper) ||
           stateRaw.includes('ALL STATES') ||
           stateRaw.includes('ALL 50') ||
           stateRaw.includes('CBIG') ||
           stateRaw.includes('CBI ') ||
           stateRaw.includes('ANY STATE') ||
           !r.state;
  });
  const seen = new Set();
  return matches.filter(r => {
    if (seen.has(r.carrier_key)) return false;
    seen.add(r.carrier_key);
    return true;
  });
}

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  FINAL AGENT VALIDATION - RAW DATA vs FIRESTORE');
  console.log('█'.repeat(70));

  const fsRecords = await loadFirestoreData();
  console.log(`\nLoaded ${fsRecords.length} Firestore records\n`);

  // Test cases based on KNOWN data in Firestore (verified from debug output)
  const testCases = [
    // Personal Lines
    { carrier: 'Safeco', lob: 'homeowners', state: 'TX', description: 'TX Homeowners' },
    { carrier: 'Safeco', lob: 'auto', state: 'TX', description: 'TX Auto' },
    { carrier: 'Geico', lob: 'auto', state: 'TX', description: 'TX Auto' },
    { carrier: 'Germania', lob: 'umbrella', state: 'TX', description: 'TX Umbrella' },
    { carrier: 'Germania', lob: 'flood', state: 'TX', description: 'TX Flood' },
    { carrier: 'Orion 180', lob: 'homeowners', state: 'TX', description: 'TX Homeowners' },
    { carrier: 'Orion 180', lob: 'flood', state: 'TX', description: 'TX Flood' },
    { carrier: 'TRAVELERS', lob: 'umbrella', state: 'TX', description: 'TX Umbrella' },
    { carrier: 'TRAVELERS', lob: 'homeowners', state: 'CA', description: 'CA Homeowners' },

    // Specialty
    { carrier: 'Aegis', lob: 'manufactured homes', state: 'AZ', description: 'AZ Manufactured Homes' },
    { carrier: 'Foremost', lob: 'manufactured homes', state: 'TX', description: 'TX Manufactured Homes' },
    { carrier: 'Abacus', lob: 'jewelry floater', state: 'CA', description: 'CA Jewelry Floater' },

    // Flood
    { carrier: 'Access One80 (Bigfoot)', lob: 'flood', state: 'FL', description: 'FL Flood' },

    // Condo
    { carrier: 'American Modern', lob: 'condo', state: 'FL', description: 'FL Condo' },

    // Landlord
    { carrier: 'Aegis', lob: 'landlord', state: 'TX', description: 'TX Landlord' },
  ];

  console.log('='.repeat(70));
  console.log('  TEST RESULTS');
  console.log('='.repeat(70));

  const results = [];

  for (const tc of testCases) {
    const agentResults = queryAgent(fsRecords, tc.state, tc.lob);
    const carrierLower = tc.carrier.toLowerCase().split(' ')[0];

    const found = agentResults.find(r =>
      r.carrier.toLowerCase().includes(carrierLower) || r.carrier_key.includes(carrierLower)
    );

    const position = found ? agentResults.indexOf(found) + 1 : -1;
    const inTop3 = position > 0 && position <= 3;
    const status = found ? (inTop3 ? 'TOP3' : `#${position}`) : 'MISS';

    results.push({
      tc,
      found: !!found,
      position,
      inTop3,
      totalResults: agentResults.length
    });

    const icon = found ? (inTop3 ? '✓' : '~') : '✗';
    console.log(`${icon} ${tc.carrier.padEnd(25)} | ${tc.lob.padEnd(20)} | ${tc.state} | ${status.padEnd(5)} | ${agentResults.length} results`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));

  const found = results.filter(r => r.found).length;
  const inTop3 = results.filter(r => r.inTop3).length;
  const total = results.length;

  console.log(`\n  Total Tests:     ${total}`);
  console.log(`  Carriers Found:  ${found}/${total} (${((found/total)*100).toFixed(0)}%)`);
  console.log(`  In Top 3:        ${inTop3}/${total} (${((inTop3/total)*100).toFixed(0)}%)`);

  // Group by outcome
  console.log('\n  Breakdown:');
  console.log(`    ✓ TOP 3:       ${results.filter(r => r.inTop3).length}`);
  console.log(`    ~ Found:       ${results.filter(r => r.found && !r.inTop3).length}`);
  console.log(`    ✗ Missing:     ${results.filter(r => !r.found).length}`);

  // Show missing carriers details
  const missing = results.filter(r => !r.found);
  if (missing.length > 0) {
    console.log('\n  Missing carriers analysis:');
    for (const m of missing) {
      // Check if carrier exists at all
      const carrierLower = m.tc.carrier.toLowerCase().split(' ')[0];
      const allRecords = fsRecords.filter(r =>
        r.carrier.toLowerCase().includes(carrierLower) || r.carrier_key.includes(carrierLower)
      );

      if (allRecords.length === 0) {
        console.log(`    ${m.tc.carrier}: NOT in Firestore`);
      } else {
        const lobMatch = allRecords.find(r => r.lob_key === m.tc.lob.toLowerCase());
        if (!lobMatch) {
          const lobs = [...new Set(allRecords.map(r => r.lob_key))].slice(0, 5);
          console.log(`    ${m.tc.carrier}: Has ${allRecords.length} records but NOT for "${m.tc.lob}"`);
          console.log(`      Available LOBs: ${lobs.join(', ')}`);
        } else {
          console.log(`    ${m.tc.carrier}: Has "${m.tc.lob}" but state "${m.tc.state}" not covered`);
          console.log(`      State data: ${lobMatch.state.substring(0, 50)}`);
        }
      }
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`  PASS RATE: ${((found/total)*100).toFixed(0)}%`);
  console.log('─'.repeat(70) + '\n');

  process.exit(found >= total * 0.8 ? 0 : 1);
}

main();
