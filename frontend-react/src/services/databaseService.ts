import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  Timestamp,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import Papa from 'papaparse';
import {
  CarrierDocument,
  CoverageTypeDocument,
  CarrierAppetiteDocument,
  COVERAGE_TYPE_MAPPINGS
} from '@/types/database';

// Collection names
const COLLECTIONS = {
  CARRIERS: 'carriers',
  COVERAGE_TYPES: 'coverageTypes',
  CARRIER_APPETITES: 'carrierAppetites',
  METADATA: 'metadata'
};

// Check if database has been seeded
export async function isDatabaseSeeded(): Promise<boolean> {
  try {
    const carriersRef = collection(db, COLLECTIONS.CARRIERS);
    const snapshot = await getDocs(carriersRef);
    return snapshot.size > 0;
  } catch (error) {
    console.error('Error checking database status:', error);
    return false;
  }
}

// Parse CSV file and return structured data
async function parseCSVFile(csvUrl: string): Promise<{
  carriers: CarrierDocument[];
  appetites: CarrierAppetiteDocument[];
  coverageTypes: CoverageTypeDocument[];
}> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rawData = results.data as string[][];

          // Find header row
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(5, rawData.length); i++) {
            const row = rawData[i];
            if (row && row[0]?.toString().toUpperCase() === 'CARRIERS') {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
            throw new Error('Could not find header row in CSV');
          }

          const headers = rawData[headerRowIndex] as string[];
          const carriers: CarrierDocument[] = [];
          const appetites: CarrierAppetiteDocument[] = [];
          const coverageTypesMap = new Map<string, CoverageTypeDocument>();

          // Create coverage types from headers (columns 4+)
          for (let j = 4; j < headers.length; j++) {
            const columnName = headers[j]?.trim();
            if (!columnName) continue;

            const mapping = COVERAGE_TYPE_MAPPINGS[columnName];
            if (mapping && !coverageTypesMap.has(mapping.name)) {
              coverageTypesMap.set(mapping.name, {
                name: mapping.name,
                columnName: columnName,
                category: mapping.category,
              });
            }
          }

          // Process data rows
          for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i] as string[];
            if (!row || !row[0] || row[0].trim() === '') continue;

            const carrierName = row[0].trim();
            if (carrierName.toLowerCase().includes('disclaimer') || carrierName.length < 2) continue;

            const statesOperatingIn = row[1]?.trim() || '';
            const knownFor = row[2]?.trim() || '';
            const carrierType = row[3]?.trim() || '';

            // Determine carrier type
            let type: CarrierDocument['type'] = 'Direct';
            const typeLower = carrierType.toLowerCase();
            if (typeLower.includes('wholesaler') && typeLower.includes('direct')) {
              type = 'Direct via Wholesaler';
            } else if (typeLower.includes('wholesaler')) {
              type = 'Wholesaler';
            }

            // Create carrier document
            const carrierId = carrierName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const carrier: CarrierDocument = {
              id: carrierId,
              name: carrierName,
              statesOperatingIn,
              knownFor,
              type,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            carriers.push(carrier);

            // Process coverage columns
            for (let j = 4; j < headers.length; j++) {
              const columnName = headers[j]?.trim();
              const value = row[j]?.trim() || '';

              if (!columnName || !value) continue;

              const mapping = COVERAGE_TYPE_MAPPINGS[columnName];
              if (!mapping) continue;

              // Check if has appetite
              const valueLower = value.toLowerCase();
              const hasAppetite = valueLower.startsWith('yes') ||
                                  (valueLower.length > 0 && !valueLower.includes('no'));

              if (hasAppetite) {
                const appetite: CarrierAppetiteDocument = {
                  carrierId,
                  carrierName,
                  coverageType: mapping.name,
                  coverageColumnName: columnName,
                  hasAppetite: true,
                  appetiteDetails: value !== 'Yes' && value.toLowerCase() !== 'yes' ? value : '',
                  statesOperatingIn,
                  knownFor,
                  carrierType: type,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                appetites.push(appetite);
              }
            }
          }

          console.log(`Parsed ${carriers.length} carriers, ${appetites.length} appetite records`);

          resolve({
            carriers,
            appetites,
            coverageTypes: Array.from(coverageTypesMap.values()),
          });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

// Clear all existing data
export async function clearDatabase(): Promise<void> {
  console.log('Clearing existing database...');

  const collections = [COLLECTIONS.CARRIERS, COLLECTIONS.COVERAGE_TYPES, COLLECTIONS.CARRIER_APPETITES, COLLECTIONS.METADATA];

  for (const collectionName of collections) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      let count = 0;

      // Delete one by one to avoid batch permission issues
      for (const document of snapshot.docs) {
        try {
          await deleteDoc(document.ref);
          count++;
        } catch (error) {
          console.error(`Error deleting document from ${collectionName}:`, error);
        }
      }

      if (count > 0) {
        console.log(`Deleted ${count} documents from ${collectionName}`);
      }
    } catch (error) {
      console.error(`Error clearing ${collectionName}:`, error);
    }
  }
}

// Seed database from CSV
export async function seedDatabaseFromCSV(csvUrl: string = '/data/carrier_appetite.csv'): Promise<{
  carriersCount: number;
  appetitesCount: number;
  coverageTypesCount: number;
}> {
  console.log('Starting database seed from CSV...');

  // Parse CSV
  const { carriers, appetites, coverageTypes } = await parseCSVFile(csvUrl);

  // Clear existing data
  await clearDatabase();

  // Seed carriers
  console.log(`Seeding ${carriers.length} carriers...`);
  let carrierCount = 0;
  for (const carrier of carriers) {
    try {
      const docRef = doc(db, COLLECTIONS.CARRIERS, carrier.id!);
      await setDoc(docRef, {
        ...carrier,
        createdAt: Timestamp.fromDate(carrier.createdAt),
        updatedAt: Timestamp.fromDate(carrier.updatedAt),
      });
      carrierCount++;
    } catch (error) {
      console.error(`Error seeding carrier ${carrier.name}:`, error);
    }
  }
  console.log(`Seeded ${carrierCount} carriers`);

  // Seed coverage types
  console.log(`Seeding ${coverageTypes.length} coverage types...`);
  let coverageCount = 0;
  for (const coverageType of coverageTypes) {
    try {
      const docId = coverageType.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const docRef = doc(db, COLLECTIONS.COVERAGE_TYPES, docId);
      await setDoc(docRef, coverageType);
      coverageCount++;
    } catch (error) {
      console.error(`Error seeding coverage type ${coverageType.name}:`, error);
    }
  }
  console.log(`Seeded ${coverageCount} coverage types`);

  // Seed appetites using Firebase batch writes (up to 500 per batch)
  console.log(`Seeding ${appetites.length} appetite records using batch writes...`);
  let seededCount = 0;
  let errorCount = 0;
  const BATCH_SIZE = 450;  // Firebase limit is 500, use 450 to be safe

  // Process in batches of 450
  for (let i = 0; i < appetites.length; i += BATCH_SIZE) {
    const batchItems = appetites.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    // Add all items to the batch - use column name in ID to avoid overwrites
    batchItems.forEach((appetite) => {
      const columnId = appetite.coverageColumnName?.toLowerCase().replace(/[^a-z0-9]/g, '_') || '';
      const docId = `${appetite.carrierId}_${columnId}_${appetite.coverageType.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const docRef = doc(db, COLLECTIONS.CARRIER_APPETITES, docId);
      batch.set(docRef, {
        ...appetite,
        createdAt: Timestamp.fromDate(appetite.createdAt),
        updatedAt: Timestamp.fromDate(appetite.updatedAt),
      });
    });

    // Commit the batch
    try {
      await batch.commit();
      seededCount += batchItems.length;
      console.log(`Batch committed: ${seededCount}/${appetites.length} records`);
    } catch (error) {
      errorCount += batchItems.length;
      console.error(`Batch error at ${i}:`, error);
    }
  }

  console.log(`Seeding complete: ${seededCount} records saved, ${errorCount} errors`);

  // Update metadata
  try {
    const metadataRef = doc(db, COLLECTIONS.METADATA, 'seedStatus');
    await setDoc(metadataRef, {
      seeded: true,
      seedDate: Timestamp.now(),
      carriersCount: carrierCount,
      appetitesCount: seededCount,
      coverageTypesCount: coverageCount,
    });
  } catch (error) {
    console.error('Error saving metadata:', error);
  }

  console.log('Database seeding complete!');

  return {
    carriersCount: carrierCount,
    appetitesCount: seededCount,
    coverageTypesCount: coverageCount,
  };
}

// Load all carriers from Firestore
export async function loadCarriersFromDB(): Promise<CarrierDocument[]> {
  const snapshot = await getDocs(collection(db, COLLECTIONS.CARRIERS));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as CarrierDocument[];
}

// Load all coverage types from Firestore
export async function loadCoverageTypesFromDB(): Promise<CoverageTypeDocument[]> {
  const snapshot = await getDocs(collection(db, COLLECTIONS.COVERAGE_TYPES));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as CoverageTypeDocument[];
}

// Load all appetite records from Firestore
export async function loadAppetitesFromDB(): Promise<CarrierAppetiteDocument[]> {
  const snapshot = await getDocs(collection(db, COLLECTIONS.CARRIER_APPETITES));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as CarrierAppetiteDocument[];
}

// Search carriers by state and coverage type
export async function searchCarriersFromDB(
  state: string,
  coverageType: string,
  limit: number = 10
): Promise<CarrierAppetiteDocument[]> {
  const appetitesRef = collection(db, COLLECTIONS.CARRIER_APPETITES);

  // Get all appetites for the coverage type
  const q = query(
    appetitesRef,
    where('coverageType', '==', coverageType),
    where('hasAppetite', '==', true)
  );

  const snapshot = await getDocs(q);
  const appetites = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as CarrierAppetiteDocument[];

  // Filter by state
  const stateUpper = state.toUpperCase();
  const filtered = appetites.filter(appetite => {
    const states = appetite.statesOperatingIn.toLowerCase();
    return !state ||
           states.includes('all states') ||
           states.includes(stateUpper.toLowerCase()) ||
           appetite.statesOperatingIn.includes(stateUpper);
  });

  // Remove duplicates by carrier
  const seen = new Set<string>();
  const unique = filtered.filter(appetite => {
    if (seen.has(appetite.carrierId)) return false;
    seen.add(appetite.carrierId);
    return true;
  });

  return unique.slice(0, limit);
}

// Get carrier details
export async function getCarrierFromDB(carrierId: string): Promise<CarrierDocument | null> {
  const snapshot = await getDocs(collection(db, COLLECTIONS.CARRIERS));
  const found = snapshot.docs.find(d => d.id === carrierId);

  if (!found) return null;

  return {
    id: found.id,
    ...found.data(),
    createdAt: found.data().createdAt?.toDate() || new Date(),
    updatedAt: found.data().updatedAt?.toDate() || new Date(),
  } as CarrierDocument;
}

// Get all appetites for a specific carrier
export async function getCarrierAppetitesFromDB(carrierId: string): Promise<CarrierAppetiteDocument[]> {
  const appetitesRef = collection(db, COLLECTIONS.CARRIER_APPETITES);
  const q = query(appetitesRef, where('carrierId', '==', carrierId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as CarrierAppetiteDocument[];
}

// Get database statistics
export async function getDatabaseStats(): Promise<{
  totalCarriers: number;
  totalAppetites: number;
  totalCoverageTypes: number;
  aiReadyRecords: number;
  lastUpdated: Date | null;
}> {
  try {
    const [carriers, appetites, coverageTypes, aiReady] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.CARRIERS)),
      getDocs(collection(db, COLLECTIONS.CARRIER_APPETITES)),
      getDocs(collection(db, COLLECTIONS.COVERAGE_TYPES)),
      getDocs(collection(db, 'aiReadyLongform')),
    ]);

    return {
      totalCarriers: carriers.size,
      totalAppetites: appetites.size,
      totalCoverageTypes: coverageTypes.size,
      aiReadyRecords: aiReady.size,
      lastUpdated: null,
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      totalCarriers: 0,
      totalAppetites: 0,
      totalCoverageTypes: 0,
      aiReadyRecords: 0,
      lastUpdated: null,
    };
  }
}

// ============================================================================
// AI READY LONGFORM SEEDING (for LangGraph Agent)
// ============================================================================

interface AIReadyLongformDocument {
  segment: string;
  carrier_raw: string;
  carrier_key: string;
  state_raw: string;
  known_for: string;
  lob_raw: string;
  lob_key: string;
  appetite_raw: string;
  appetite_status: 'yes' | 'conditional' | 'no';
  carrier_type: string;
  rule_signal_tags: string;
  needs_review: boolean;
  createdAt: any;
  updatedAt: any;
}

// LOB key normalization for proper matching
const LOB_KEY_MAPPINGS: Record<string, string> = {
  // Personal Lines - Home
  'Home': 'homeowners',
  'HO3': 'ho3',
  'Condo': 'condo',
  'Renters HO4': 'renters',
  'Landlord/DP3': 'landlord',
  'Dwelling Fire': 'dwelling fire',
  'Manufactured Homes': 'manufactured homes',
  'City Living': 'homeowners',
  'High Net Worth Client': 'high net worth',
  'Home with Old Roofs': 'homeowners',
  'Homes with Dangerous Dogs': 'homeowners',
  'Homes with Prior Losses': 'homeowners',
  'Barndominium': 'manufactured homes',
  'Tiny Homes': 'manufactured homes',
  'Log Home': 'homeowners',
  'Floating Home': 'homeowners',

  // Auto
  'Auto': 'auto',
  'Auto Home Combo Policy': 'auto',
  'Packaged Polices Auto & Home': 'auto',
  'Mexico Auto': 'auto',
  'Collector Cars': 'collector cars',
  'Motorcycle': 'motorcycle',
  'Uber/Lyft/Ride Sharing': 'rideshare',

  // Recreational
  'Boat': 'boat',
  'Classic Boats': 'boat',
  'Yachts': 'yachts',
  'RV Insurance': 'rv',
  'Travel Trailer': 'rv',
  'Rental RV, Camper, Trailer, MC': 'rv',
  'ATV/UTV': 'atv',
  'Golf Carts': 'atv',
  'Snowmobile': 'snowmobile',

  // Liability
  'Umbrella': 'umbrella',
  'Excess Liability': 'umbrella',

  // Specialty
  'Flood': 'flood',
  'Earthquake': 'earthquake',
  'Earthquake Deductible Buyback': 'earthquake',
  'Jewelry Floater': 'jewelry floater',
  'Personal Article Floater': 'jewelry floater',
  'Collections': 'jewelry floater',
  'Airbnb': 'short term rental',
  'VRBO': 'short term rental',
  'Short Term Rentals': 'short term rental',
  'Pet Insurance': 'pet',
  'Travel ': 'travel',
  'Flippers': 'flippers',
  'Unoccupied/ Vacant Dwelling': 'vacant dwelling',
  'Service Line Coverage': 'service line',
  'Equipment Breakdown': 'equipment breakdown',
  'Home Systems': 'home systems',
  'Storage Units': 'storage',
  'Offsite Storage': 'storage',
};

// Normalize carrier name to key
function normalizeCarrierKey(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize LOB to key
function normalizeLobKey(columnName: string): string {
  // Check explicit mappings first
  if (LOB_KEY_MAPPINGS[columnName]) {
    return LOB_KEY_MAPPINGS[columnName];
  }
  // Fallback to simple normalization
  return columnName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Determine segment from LOB
function determineSegment(lobRaw: string): string {
  const lower = lobRaw.toLowerCase();
  if (lower.includes('commercial') || lower.includes('bop') ||
      lower.includes('general liability') || lower.includes('workers')) {
    return 'commercial';
  }
  return 'personal';
}

// Seed aiReadyLongform collection from CSV (for LangGraph agent)
export async function seedAIReadyLongform(csvUrl: string = '/data/carrier_appetite.csv'): Promise<{
  recordsCount: number;
  carriersCount: number;
  lobsCount: number;
}> {
  console.log('Starting AI Ready Longform seed from CSV...');

  // Parse CSV
  const { appetites } = await parseCSVForAIReady(csvUrl);

  // Clear existing aiReadyLongform collection
  console.log('Clearing existing aiReadyLongform collection...');
  try {
    const aiReadyRef = collection(db, 'aiReadyLongform');
    const snapshot = await getDocs(aiReadyRef);
    for (const document of snapshot.docs) {
      await deleteDoc(document.ref);
    }
    console.log(`Deleted ${snapshot.size} existing records`);
  } catch (error) {
    console.error('Error clearing aiReadyLongform:', error);
  }

  // Create AI Ready records
  const aiReadyRecords: AIReadyLongformDocument[] = [];
  const uniqueLobs = new Set<string>();
  const uniqueCarriers = new Set<string>();

  for (const appetite of appetites) {
    const lobKey = normalizeLobKey(appetite.coverageColumnName);
    const carrierKey = normalizeCarrierKey(appetite.carrierName);

    uniqueLobs.add(lobKey);
    uniqueCarriers.add(carrierKey);

    const record: AIReadyLongformDocument = {
      segment: determineSegment(appetite.coverageColumnName),
      carrier_raw: appetite.carrierName,
      carrier_key: carrierKey,
      state_raw: appetite.statesOperatingIn,
      known_for: appetite.knownFor,
      lob_raw: appetite.coverageColumnName,
      lob_key: lobKey,
      appetite_raw: appetite.appetiteDetails || '',
      appetite_status: appetite.hasAppetite ?
        (appetite.appetiteDetails && appetite.appetiteDetails.toLowerCase() !== 'yes' ? 'conditional' : 'yes') :
        'no',
      carrier_type: appetite.carrierType,
      rule_signal_tags: '',
      needs_review: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Only include records with positive appetite
    if (record.appetite_status !== 'no') {
      aiReadyRecords.push(record);
    }
  }

  // Seed in batches
  console.log(`Seeding ${aiReadyRecords.length} AI Ready records...`);
  let seededCount = 0;
  const BATCH_SIZE = 450;

  for (let i = 0; i < aiReadyRecords.length; i += BATCH_SIZE) {
    const batchItems = aiReadyRecords.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    batchItems.forEach((record) => {
      const docId = `${record.carrier_key}_${record.lob_key}`.replace(/[^a-z0-9_]/g, '_');
      const docRef = doc(db, 'aiReadyLongform', docId);
      batch.set(docRef, record);
    });

    try {
      await batch.commit();
      seededCount += batchItems.length;
      console.log(`Batch committed: ${seededCount}/${aiReadyRecords.length}`);
    } catch (error) {
      console.error(`Batch error at ${i}:`, error);
    }
  }

  console.log(`AI Ready seeding complete: ${seededCount} records, ${uniqueCarriers.size} carriers, ${uniqueLobs.size} LOBs`);
  console.log(`LOBs indexed: ${Array.from(uniqueLobs).join(', ')}`);

  // Update metadata
  try {
    const metadataRef = doc(db, COLLECTIONS.METADATA, 'aiReadySeedStatus');
    await setDoc(metadataRef, {
      seeded: true,
      seedDate: Timestamp.now(),
      recordsCount: seededCount,
      carriersCount: uniqueCarriers.size,
      lobsCount: uniqueLobs.size,
      lobs: Array.from(uniqueLobs),
    });
  } catch (error) {
    console.error('Error saving metadata:', error);
  }

  return {
    recordsCount: seededCount,
    carriersCount: uniqueCarriers.size,
    lobsCount: uniqueLobs.size,
  };
}

// Parse CSV specifically for AI Ready format
async function parseCSVForAIReady(csvUrl: string): Promise<{
  carriers: CarrierDocument[];
  appetites: CarrierAppetiteDocument[];
}> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rawData = results.data as string[][];

          // Find header row
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(5, rawData.length); i++) {
            const row = rawData[i];
            if (row && row[0]?.toString().toUpperCase() === 'CARRIERS') {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
            throw new Error('Could not find header row in CSV');
          }

          const headers = rawData[headerRowIndex] as string[];
          const carriers: CarrierDocument[] = [];
          const appetites: CarrierAppetiteDocument[] = [];

          // Process data rows
          for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i] as string[];
            if (!row || !row[0] || row[0].trim() === '') continue;

            const carrierName = row[0].trim();
            if (carrierName.toLowerCase().includes('disclaimer') || carrierName.length < 2) continue;

            const statesOperatingIn = row[1]?.trim() || '';
            const knownFor = row[2]?.trim() || '';
            const carrierType = row[3]?.trim() || '';

            // Determine carrier type
            let type: CarrierDocument['type'] = 'Direct';
            const typeLower = carrierType.toLowerCase();
            if (typeLower.includes('wholesaler') && typeLower.includes('direct')) {
              type = 'Direct via Wholesaler';
            } else if (typeLower.includes('wholesaler')) {
              type = 'Wholesaler';
            }

            const carrierId = carrierName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const carrier: CarrierDocument = {
              id: carrierId,
              name: carrierName,
              statesOperatingIn,
              knownFor,
              type,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            carriers.push(carrier);

            // Process coverage columns
            for (let j = 4; j < headers.length; j++) {
              const columnName = headers[j]?.trim();
              const value = row[j]?.trim() || '';

              if (!columnName || !value) continue;

              // Check if has appetite (not empty, not "no")
              const valueLower = value.toLowerCase();
              const hasAppetite = valueLower.length > 0 &&
                                  !valueLower.includes('no') &&
                                  valueLower !== 'n/a';

              if (hasAppetite) {
                const appetite: CarrierAppetiteDocument = {
                  carrierId,
                  carrierName,
                  coverageType: COVERAGE_TYPE_MAPPINGS[columnName]?.name || columnName,
                  coverageColumnName: columnName,
                  hasAppetite: true,
                  appetiteDetails: value !== 'Yes' && valueLower !== 'yes' ? value : '',
                  statesOperatingIn,
                  knownFor,
                  carrierType: type,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                appetites.push(appetite);
              }
            }
          }

          console.log(`Parsed for AI Ready: ${carriers.length} carriers, ${appetites.length} appetite records`);
          resolve({ carriers, appetites });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

// Verify AI Ready data is properly seeded
export async function verifyAIReadyData(): Promise<{
  isValid: boolean;
  recordCount: number;
  sampleLobs: string[];
  sampleCarriers: string[];
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    const aiReadyRef = collection(db, 'aiReadyLongform');
    const snapshot = await getDocs(aiReadyRef);

    if (snapshot.size === 0) {
      return {
        isValid: false,
        recordCount: 0,
        sampleLobs: [],
        sampleCarriers: [],
        issues: ['No records found in aiReadyLongform collection'],
      };
    }

    const lobs = new Set<string>();
    const carriers = new Set<string>();

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Check required fields
      if (!data.carrier_key) issues.push(`Missing carrier_key in doc ${doc.id}`);
      if (!data.lob_key) issues.push(`Missing lob_key in doc ${doc.id}`);
      if (!data.appetite_status) issues.push(`Missing appetite_status in doc ${doc.id}`);

      if (data.lob_key) lobs.add(data.lob_key);
      if (data.carrier_key) carriers.add(data.carrier_key);
    });

    return {
      isValid: issues.length === 0,
      recordCount: snapshot.size,
      sampleLobs: Array.from(lobs).slice(0, 20),
      sampleCarriers: Array.from(carriers).slice(0, 20),
      issues: issues.slice(0, 10),
    };
  } catch (error) {
    return {
      isValid: false,
      recordCount: 0,
      sampleLobs: [],
      sampleCarriers: [],
      issues: [`Error verifying data: ${error}`],
    };
  }
}
