/**
 * Seed aiReadyLongform collection from CBIG_AI_READY_LONGFORM.csv
 * Run with: node scripts/seedAIReady.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase config
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

// LOB key normalization
const LOB_KEY_MAPPINGS = {
  'Home': 'homeowners',
  'HO3': 'ho3',
  'Condo': 'condo',
  'Renters HO4': 'renters',
  'Landlord/DP3': 'landlord',
  'Dwelling Fire': 'dwelling fire',
  'Manufactured Homes': 'manufactured homes',
  'Auto': 'auto',
  'Motorcycle': 'motorcycle',
  'Collector Cars': 'collector cars',
  'Boat': 'boat',
  'Yachts': 'yachts',
  'RV Insurance': 'rv',
  'Umbrella': 'umbrella',
  'Flood': 'flood',
  'Earthquake': 'earthquake',
  'Jewelry Floater': 'jewelry floater',
  'Personal Article Floater': 'jewelry floater',
  'High Net Worth Client': 'high net worth',
  'Short Term Rentals': 'short term rental',
  'Airbnb': 'short term rental',
  'VRBO': 'short term rental',
};

function normalizeCarrierKey(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLobKey(lob) {
  if (LOB_KEY_MAPPINGS[lob]) {
    return LOB_KEY_MAPPINGS[lob];
  }
  return lob.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function determineAppetiteStatus(status) {
  if (!status) return 'no';
  const lower = status.toLowerCase().trim();
  if (lower === 'yes') return 'yes';
  if (lower === 'no' || lower === '') return 'no';
  return 'conditional';
}

async function clearCollection() {
  console.log('Clearing existing aiReadyLongform collection...');
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  if (snapshot.size === 0) {
    console.log('Collection already empty.');
    return;
  }

  let deleted = 0;
  for (const document of snapshot.docs) {
    await deleteDoc(document.ref);
    deleted++;
    if (deleted % 100 === 0) {
      console.log(`Deleted ${deleted}/${snapshot.size}...`);
    }
  }
  console.log(`Deleted ${deleted} documents.`);
}

async function seedFromCSV() {
  const csvPath = join(__dirname, '../public/data/CBIG_AI_READY_LONGFORM.csv');
  console.log(`\nReading CSV from: ${csvPath}`);

  const records = [];
  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  for await (const row of parser) {
    // Skip records with no appetite
    const status = determineAppetiteStatus(row.appetite_status);
    if (status === 'no') continue;

    const carrierKey = normalizeCarrierKey(row.carrier_raw || '');
    const lobKey = normalizeLobKey(row.lob_raw || '');

    if (!carrierKey || !lobKey) continue;

    records.push({
      segment: row.segment || 'personal',
      carrier_raw: row.carrier_raw || '',
      carrier_key: carrierKey,
      state_raw: row.state_raw || '',
      known_for: row.known_for || '',
      lob_raw: row.lob_raw || '',
      lob_key: lobKey,
      appetite_raw: row.appetite_raw || '',
      appetite_status: status,
      carrier_type: row.carrier_type || 'Direct',
      rule_signal_tags: row.rule_signal_tags || '',
      needs_review: row.needs_review === 'true' || row.needs_review === true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log(`Parsed ${records.length} records with positive appetite.`);

  // Get unique stats
  const uniqueLobs = new Set(records.map(r => r.lob_key));
  const uniqueCarriers = new Set(records.map(r => r.carrier_key));
  console.log(`Unique LOBs: ${uniqueLobs.size}`);
  console.log(`Unique Carriers: ${uniqueCarriers.size}`);

  // Seed in batches
  console.log('\nSeeding to Firestore...');
  const BATCH_SIZE = 450;
  let seeded = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const batchRecords = records.slice(i, i + BATCH_SIZE);

    for (const record of batchRecords) {
      const docId = `${record.carrier_key}_${record.lob_key}`.replace(/[^a-z0-9_]/g, '_');
      const docRef = doc(db, 'aiReadyLongform', docId);
      batch.set(docRef, record);
    }

    await batch.commit();
    seeded += batchRecords.length;
    console.log(`Seeded ${seeded}/${records.length}...`);
  }

  console.log(`\nSeeding complete: ${seeded} documents created.`);

  // Print sample LOBs
  console.log('\nSample LOBs indexed:');
  Array.from(uniqueLobs).slice(0, 20).forEach(lob => {
    console.log(`  - ${lob}`);
  });

  return { records: seeded, lobs: uniqueLobs.size, carriers: uniqueCarriers.size };
}

async function main() {
  console.log('========================================');
  console.log('   SEED aiReadyLongform COLLECTION');
  console.log('========================================\n');

  try {
    await clearCollection();
    const result = await seedFromCSV();

    console.log('\n========================================');
    console.log('   SEEDING COMPLETE');
    console.log(`   Records: ${result.records}`);
    console.log(`   LOBs: ${result.lobs}`);
    console.log(`   Carriers: ${result.carriers}`);
    console.log('========================================\n');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
