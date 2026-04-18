/**
 * Check specific LOB keys for agent queries
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

const KEY_LOBS = [
  'homeowners', 'home', 'ho3',
  'auto', 'personal auto',
  'landlord', 'dwelling fire', 'dp3',
  'condo',
  'renters',
  'umbrella',
  'flood',
  'boat',
  'motorcycle',
  'manufactured homes',
];

async function checkLOBs() {
  console.log('Checking key LOBs in aiReadyLongform...\n');

  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  // Count records per LOB key
  const lobCounts = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const lobKey = data.lob_key || '';
    lobCounts.set(lobKey, (lobCounts.get(lobKey) || 0) + 1);
  });

  console.log('KEY LOBs Record Counts:');
  console.log('------------------------');

  for (const lob of KEY_LOBS) {
    const count = lobCounts.get(lob) || 0;
    const status = count > 0 ? '✓' : '✗';
    console.log(`${status} ${lob}: ${count} records`);
  }

  console.log('\n\nTOP 30 LOBs by record count:');
  console.log('----------------------------');

  const sorted = Array.from(lobCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  sorted.forEach(([lob, count], i) => {
    console.log(`${i + 1}. ${lob}: ${count}`);
  });

  // Check sample homeowners records
  console.log('\n\nSample HOMEOWNERS records:');
  console.log('--------------------------');

  let homeCount = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.lob_key === 'homeowners' && homeCount < 5) {
      console.log(`  ${data.carrier_raw} | ${data.state_raw?.substring(0, 40)} | ${data.appetite_status}`);
      homeCount++;
    }
  });

  // Check sample AUTO records
  console.log('\n\nSample AUTO records:');
  console.log('--------------------');

  let autoCount = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.lob_key === 'auto' && autoCount < 5) {
      console.log(`  ${data.carrier_raw} | ${data.state_raw?.substring(0, 40)} | ${data.appetite_status}`);
      autoCount++;
    }
  });
}

checkLOBs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
