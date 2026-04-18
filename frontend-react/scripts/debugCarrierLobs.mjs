/**
 * Debug: Check what LOBs exist for specific carriers in Firestore
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

async function debug() {
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  const carriersToCheck = ['safeco', 'geico', 'travelers', 'orion', 'germania'];
  const results = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    const carrierKey = (data.carrier_key || '').toLowerCase();
    const carrier = data.carrier_raw || '';
    const lobKey = data.lob_key || '';
    const lobRaw = data.lob_raw || '';
    const status = data.appetite_status || '';

    for (const check of carriersToCheck) {
      if (carrierKey.includes(check)) {
        if (!results[carrier]) {
          results[carrier] = [];
        }
        results[carrier].push({
          lob_key: lobKey,
          lob_raw: lobRaw,
          status: status
        });
      }
    }
  });

  console.log('\n=== CARRIER LOBs IN FIRESTORE ===\n');

  for (const [carrier, lobs] of Object.entries(results)) {
    console.log(`\n${carrier}:`);
    console.log(`  LOBs (${lobs.length}):`);
    lobs.slice(0, 15).forEach(l => {
      console.log(`    - ${l.lob_key} | ${l.lob_raw} | ${l.status}`);
    });
    if (lobs.length > 15) {
      console.log(`    ... and ${lobs.length - 15} more`);
    }
  }

  // Check specifically for homeowners/home LOBs
  console.log('\n\n=== ALL "HOME" OR "HOMEOWNERS" LOBs ===\n');
  const homeLobs = new Set();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const lobKey = (data.lob_key || '').toLowerCase();
    if (lobKey.includes('home') || lobKey.includes('ho3')) {
      homeLobs.add(`${lobKey} | ${data.lob_raw}`);
    }
  });

  Array.from(homeLobs).slice(0, 20).forEach(l => console.log(`  ${l}`));
  console.log(`\n  Total "home" LOBs: ${homeLobs.size}`);

  // Check for auto LOBs
  console.log('\n\n=== ALL "AUTO" LOBs ===\n');
  const autoLobs = new Set();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const lobKey = (data.lob_key || '').toLowerCase();
    if (lobKey === 'auto' || lobKey.startsWith('auto ')) {
      autoLobs.add(`${lobKey} | ${data.lob_raw}`);
    }
  });

  Array.from(autoLobs).slice(0, 20).forEach(l => console.log(`  ${l}`));
  console.log(`\n  Total "auto" LOBs: ${autoLobs.size}`);
}

debug().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
