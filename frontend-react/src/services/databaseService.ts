import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
  Timestamp,
  deleteDoc
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
    const metadataRef = doc(db, COLLECTIONS.METADATA, 'seedStatus');
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

  // Seed appetites one by one to avoid batch permission issues
  console.log(`Seeding ${appetites.length} appetite records...`);
  let seededCount = 0;
  for (const appetite of appetites) {
    try {
      const docId = `${appetite.carrierId}_${appetite.coverageType.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const docRef = doc(db, COLLECTIONS.CARRIER_APPETITES, docId);
      await setDoc(docRef, {
        ...appetite,
        createdAt: Timestamp.fromDate(appetite.createdAt),
        updatedAt: Timestamp.fromDate(appetite.updatedAt),
      });
      seededCount++;
      if (seededCount % 50 === 0) {
        console.log(`Seeded ${seededCount}/${appetites.length} appetite records...`);
      }
    } catch (error) {
      console.error(`Error seeding appetite for ${appetite.carrierName}:`, error);
    }
  }
  console.log(`Seeded ${seededCount} appetite records`);

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
  const docRef = doc(db, COLLECTIONS.CARRIERS, carrierId);
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
  lastUpdated: Date | null;
}> {
  try {
    const [carriers, appetites, coverageTypes] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.CARRIERS)),
      getDocs(collection(db, COLLECTIONS.CARRIER_APPETITES)),
      getDocs(collection(db, COLLECTIONS.COVERAGE_TYPES)),
    ]);

    const metadataRef = doc(db, COLLECTIONS.METADATA, 'seedStatus');

    return {
      totalCarriers: carriers.size,
      totalAppetites: appetites.size,
      totalCoverageTypes: coverageTypes.size,
      lastUpdated: null, // Could fetch from metadata
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      totalCarriers: 0,
      totalAppetites: 0,
      totalCoverageTypes: 0,
      lastUpdated: null,
    };
  }
}
