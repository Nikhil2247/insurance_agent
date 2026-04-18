/**
 * Firestore Data Verification Script
 * Run with: node scripts/verifyFirestore.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

// Firebase config from .env
const firebaseConfig = {
  apiKey: "AIzaSyCUQ4TXUEI90WYzc8PyoDmtxCbLAA4ZJeM",
  authDomain: "insurance-agent-4f3e1.firebaseapp.com",
  projectId: "insurance-agent-4f3e1",
  storageBucket: "insurance-agent-4f3e1.firebasestorage.app",
  messagingSenderId: "536266402393",
  appId: "1:536266402393:web:fdcb7148a6e88d8c251f48"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verifyCollections() {
  console.log('========================================');
  console.log('   FIRESTORE DATA VERIFICATION');
  console.log('========================================\n');

  // Check aiReadyLongform collection
  console.log('1. Checking aiReadyLongform collection...');
  try {
    const aiReadyRef = collection(db, 'aiReadyLongform');
    const snapshot = await getDocs(aiReadyRef);

    console.log(`   Total documents: ${snapshot.size}`);

    if (snapshot.size > 0) {
      const lobs = new Set();
      const carriers = new Set();
      const statuses = new Map();
      let sampleDocs = [];

      snapshot.forEach((doc) => {
        const data = doc.data();

        if (data.lob_key) lobs.add(data.lob_key);
        if (data.carrier_key) carriers.add(data.carrier_key);

        const status = data.appetite_status || 'unknown';
        statuses.set(status, (statuses.get(status) || 0) + 1);

        if (sampleDocs.length < 5) {
          sampleDocs.push({
            id: doc.id,
            carrier: data.carrier_raw,
            lob: data.lob_key,
            status: data.appetite_status,
            state: data.state_raw?.substring(0, 50)
          });
        }
      });

      console.log(`   Unique LOBs: ${lobs.size}`);
      console.log(`   Unique Carriers: ${carriers.size}`);
      console.log(`   Status distribution:`);
      statuses.forEach((count, status) => {
        console.log(`      - ${status}: ${count}`);
      });

      console.log('\n   Sample LOBs:');
      Array.from(lobs).slice(0, 15).forEach(lob => {
        console.log(`      - ${lob}`);
      });

      console.log('\n   Sample Carriers:');
      Array.from(carriers).slice(0, 15).forEach(carrier => {
        console.log(`      - ${carrier}`);
      });

      console.log('\n   Sample Documents:');
      sampleDocs.forEach((doc, i) => {
        console.log(`      ${i + 1}. ${doc.carrier} | ${doc.lob} | ${doc.status}`);
      });
    } else {
      console.log('   WARNING: Collection is EMPTY!');
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  // Check carrierAppetites collection (legacy)
  console.log('\n2. Checking carrierAppetites collection (legacy)...');
  try {
    const appetitesRef = collection(db, 'carrierAppetites');
    const snapshot = await getDocs(appetitesRef);
    console.log(`   Total documents: ${snapshot.size}`);

    if (snapshot.size > 0) {
      const firstDoc = snapshot.docs[0].data();
      console.log(`   Sample fields: ${Object.keys(firstDoc).join(', ')}`);
    }
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  // Check carriers collection
  console.log('\n3. Checking carriers collection...');
  try {
    const carriersRef = collection(db, 'carriers');
    const snapshot = await getDocs(carriersRef);
    console.log(`   Total documents: ${snapshot.size}`);
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  // Check coverageTypes collection
  console.log('\n4. Checking coverageTypes collection...');
  try {
    const coverageRef = collection(db, 'coverageTypes');
    const snapshot = await getDocs(coverageRef);
    console.log(`   Total documents: ${snapshot.size}`);
  } catch (error) {
    console.log(`   ERROR: ${error.message}`);
  }

  console.log('\n========================================');
  console.log('   VERIFICATION COMPLETE');
  console.log('========================================\n');
}

// Run verification
verifyCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
