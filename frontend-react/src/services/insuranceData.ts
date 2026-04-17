import Papa from 'papaparse';
import {
  isDatabaseSeeded,
  loadCarriersFromDB,
  loadAppetitesFromDB,
  loadCoverageTypesFromDB,
  searchCarriersFromDB,
  seedDatabaseFromCSV
} from './databaseService';
import { CarrierAppetiteDocument, COVERAGE_TYPE_MAPPINGS } from '@/types/database';

export interface CarrierInfo {
  carrier: string;
  statesOperatingIn: string;
  knownFor: string;
  directOrWholesaler: string;
  coverages: Map<string, string>;
}

export interface AppetiteRecord {
  carrier: string;
  state: string;
  lob: string;
  appetite: string;
  details: string;
  statesOperatingIn: string;
  knownFor: string;
  directOrWholesaler: string;
}

export interface RuleRecord {
  carrier: string;
  rule_type: string;
  rule_text: string;
  lob: string;
  state: string;
}

interface InsuranceData {
  carriers: Map<string, CarrierInfo>;
  appetiteRecords: AppetiteRecord[];
  ruleRecords: RuleRecord[];
  allCarriers: Set<string>;
  allStates: Set<string>;
  allLobs: Set<string>;
  loaded: boolean;
  loadedFromDB: boolean;
}

const insuranceData: InsuranceData = {
  carriers: new Map(),
  appetiteRecords: [],
  ruleRecords: [],
  allCarriers: new Set(),
  allStates: new Set(),
  allLobs: new Set(),
  loaded: false,
  loadedFromDB: false
};

// Local storage cache key
const CACHE_KEY = 'insurance_data_cache';
const CACHE_EXPIRY_KEY = 'insurance_data_cache_expiry';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// LOB column mappings from the CSV headers
const lobColumnMappings: Record<string, string[]> = {
  'Homeowners': ['Home', 'HO3', 'Condo', 'Dwelling Fire', 'High Net Worth Client'],
  'Auto': ['Auto', 'Auto Home Combo Policy', 'Classic Boats', 'Collector Cars', 'Mexico Auto', 'Motorcycle'],
  'Umbrella': ['Umbrella', 'Excess Liability'],
  'Flood': ['Flood'],
  'Renters': ['Renters HO4'],
  'Landlord': ['Landlord/DP3'],
  'Manufactured Home': ['Manufactured Homes', 'Tiny Homes', 'Barndominium'],
  'Boat': ['Boat', 'Yachts', 'Classic Boats'],
  'RV': ['RV Insurance', 'Travel Trailer', 'Rental RV, Camper, Trailer, MC'],
  'Jewelry': ['Jewelry Floater', 'Collections', 'Personal Article Floater'],
  'Short Term Rental': ['Airbnb', 'VRBO', 'Short Term Rentals'],
  'Earthquake': ['Earthquake', 'Earthquake Deductible Buyback'],
  'Travel': ['Travel'],
  'Pet': ['Pet Insurance'],
  'Cyber': ['Cyber'],
  'Professional Liability': ['Professional Liability']
};

// Try to load from local storage cache
function loadFromCache(): boolean {
  try {
    const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);
    if (!expiry || Date.now() > parseInt(expiry)) {
      return false;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return false;

    const data = JSON.parse(cached);

    insuranceData.carriers = new Map(data.carriers);
    insuranceData.appetiteRecords = data.appetiteRecords;
    insuranceData.allCarriers = new Set(data.allCarriers);
    insuranceData.allStates = new Set(data.allStates);
    insuranceData.allLobs = new Set(data.allLobs);
    insuranceData.loaded = true;
    insuranceData.loadedFromDB = data.loadedFromDB || false;

    console.log('Loaded insurance data from cache');
    return true;
  } catch (error) {
    console.error('Error loading from cache:', error);
    return false;
  }
}

// Save to local storage cache
function saveToCache(): void {
  try {
    const data = {
      carriers: Array.from(insuranceData.carriers.entries()),
      appetiteRecords: insuranceData.appetiteRecords,
      allCarriers: Array.from(insuranceData.allCarriers),
      allStates: Array.from(insuranceData.allStates),
      allLobs: Array.from(insuranceData.allLobs),
      loadedFromDB: insuranceData.loadedFromDB
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION).toString());
    console.log('Saved insurance data to cache');
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
}

// Clear cache
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_EXPIRY_KEY);
  insuranceData.loaded = false;
  console.log('Cache cleared');
}

// Parse states from string like "AZ, NE, NV, OK, OR, TN, TX" or "All states..."
function parseStates(stateString: string): string[] {
  if (!stateString) return [];

  const lower = stateString.toLowerCase();
  if (lower.includes('all states') || lower.includes('all 50')) {
    return ['ALL'];
  }

  // Extract state abbreviations
  const stateMatches = stateString.match(/\b[A-Z]{2}\b/g);
  return stateMatches || [];
}

// Check if a value indicates positive appetite
function hasAppetite(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return lower.startsWith('yes') || lower === 'true' || lower.length > 0 && !lower.includes('no');
}

// Load from Firestore database
async function loadFromDatabase(): Promise<boolean> {
  try {
    const isSeeded = await isDatabaseSeeded();
    if (!isSeeded) {
      console.log('Database not seeded, will use CSV');
      return false;
    }

    console.log('Loading data from Firestore...');

    const [carriers, appetites] = await Promise.all([
      loadCarriersFromDB(),
      loadAppetitesFromDB()
    ]);

    // Clear existing data
    insuranceData.carriers.clear();
    insuranceData.appetiteRecords = [];
    insuranceData.allCarriers.clear();
    insuranceData.allStates.clear();
    insuranceData.allLobs.clear();

    // Process carriers
    for (const carrier of carriers) {
      const carrierInfo: CarrierInfo = {
        carrier: carrier.name,
        statesOperatingIn: carrier.statesOperatingIn,
        knownFor: carrier.knownFor,
        directOrWholesaler: carrier.type,
        coverages: new Map()
      };
      insuranceData.carriers.set(carrier.name, carrierInfo);
      insuranceData.allCarriers.add(carrier.name);

      // Parse states
      const states = parseStates(carrier.statesOperatingIn);
      states.forEach(s => insuranceData.allStates.add(s));
    }

    // Process appetites
    for (const appetite of appetites) {
      insuranceData.allLobs.add(appetite.coverageType);

      // Create records for each state
      const states = parseStates(appetite.statesOperatingIn);
      const statesToUse = states.length > 0 ? states : ['ALL'];

      for (const state of statesToUse) {
        insuranceData.appetiteRecords.push({
          carrier: appetite.carrierName,
          state: state,
          lob: appetite.coverageType,
          appetite: 'Yes',
          details: appetite.appetiteDetails || appetite.knownFor,
          statesOperatingIn: appetite.statesOperatingIn,
          knownFor: appetite.knownFor,
          directOrWholesaler: appetite.carrierType
        });
      }
    }

    insuranceData.loaded = true;
    insuranceData.loadedFromDB = true;

    console.log(`Loaded from DB: ${insuranceData.carriers.size} carriers, ${insuranceData.appetiteRecords.length} records`);

    // Save to cache
    saveToCache();

    return true;
  } catch (error) {
    console.error('Error loading from database:', error);
    return false;
  }
}

async function loadCSV(url: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data as any[]);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

// Load from CSV file (fallback)
async function loadFromCSV(): Promise<void> {
  console.log('Loading data from CSV...');

  const rawData = await loadCSV('/data/carrier_appetite.csv');

  // Find the header row (contains "CARRIERS")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (row && row[0] && row[0].toString().toUpperCase() === 'CARRIERS') {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error('Could not find header row');
    return;
  }

  const headers = rawData[headerRowIndex] as string[];

  // Process data rows
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i] as string[];
    if (!row || !row[0] || row[0].trim() === '') continue;

    const carrierName = row[0].trim();
    if (carrierName.toLowerCase().includes('disclaimer') || carrierName.length < 2) continue;

    const statesOperatingIn = row[1] || '';
    const knownFor = row[2] || '';
    const directOrWholesaler = row[3] || '';

    // Create carrier info
    const carrierInfo: CarrierInfo = {
      carrier: carrierName,
      statesOperatingIn,
      knownFor,
      directOrWholesaler,
      coverages: new Map()
    };

    // Map each coverage column
    for (let j = 4; j < headers.length && j < row.length; j++) {
      const header = headers[j];
      const value = row[j];
      if (header && value) {
        carrierInfo.coverages.set(header.trim(), value.trim());
      }
    }

    insuranceData.carriers.set(carrierName, carrierInfo);
    insuranceData.allCarriers.add(carrierName);

    // Parse states for this carrier
    const states = parseStates(statesOperatingIn);
    states.forEach(s => insuranceData.allStates.add(s));

    // Create appetite records for each LOB this carrier supports
    for (const [lobCategory, columnNames] of Object.entries(lobColumnMappings)) {
      let hasLobAppetite = false;
      let details: string[] = [];

      for (const colName of columnNames) {
        const colIndex = headers.findIndex(h => h && h.trim().toLowerCase() === colName.toLowerCase());
        if (colIndex !== -1 && row[colIndex]) {
          const value = row[colIndex].trim();
          if (hasAppetite(value)) {
            hasLobAppetite = true;
            if (value.toLowerCase() !== 'yes' && value.length > 3) {
              details.push(`${colName}: ${value}`);
            }
          }
        }
      }

      if (hasLobAppetite) {
        insuranceData.allLobs.add(lobCategory);

        // Create records for each state
        const statesToUse = states.length > 0 ? states : ['ALL'];
        for (const state of statesToUse) {
          insuranceData.appetiteRecords.push({
            carrier: carrierName,
            state: state,
            lob: lobCategory,
            appetite: 'Yes',
            details: details.join('; ') || knownFor,
            statesOperatingIn,
            knownFor,
            directOrWholesaler
          });
        }
      }
    }
  }

  insuranceData.loaded = true;
  insuranceData.loadedFromDB = false;

  console.log(`Loaded from CSV: ${insuranceData.carriers.size} carriers, ${insuranceData.appetiteRecords.length} records`);

  // Save to cache
  saveToCache();
}

// Main load function
export async function loadInsuranceData(): Promise<void> {
  if (insuranceData.loaded) return;

  // Try cache first
  if (loadFromCache()) {
    return;
  }

  // Try database
  const loadedFromDB = await loadFromDatabase();
  if (loadedFromDB) {
    return;
  }

  // Fallback to CSV
  await loadFromCSV();
}

// Force reload from database
export async function reloadFromDatabase(): Promise<boolean> {
  clearCache();
  insuranceData.loaded = false;
  return await loadFromDatabase();
}

// Force reload from CSV
export async function reloadFromCSV(): Promise<void> {
  clearCache();
  insuranceData.loaded = false;
  insuranceData.carriers.clear();
  insuranceData.appetiteRecords = [];
  insuranceData.allCarriers.clear();
  insuranceData.allStates.clear();
  insuranceData.allLobs.clear();
  await loadFromCSV();
}

// Seed database from CSV
export async function seedDatabase(): Promise<{
  carriersCount: number;
  appetitesCount: number;
  coverageTypesCount: number;
}> {
  const result = await seedDatabaseFromCSV();
  clearCache();
  await loadFromDatabase();
  return result;
}

export function searchCarriers(state: string, lob: string, limit = 10): AppetiteRecord[] {
  const stateUpper = state.toUpperCase();
  const lobLower = lob.toLowerCase();

  // Map user's LOB query to our standard categories
  let matchingLobs: string[] = [];

  // Check against COVERAGE_TYPE_MAPPINGS for database-loaded data
  for (const [columnName, mapping] of Object.entries(COVERAGE_TYPE_MAPPINGS)) {
    if (mapping.name.toLowerCase().includes(lobLower) ||
        columnName.toLowerCase().includes(lobLower) ||
        lobLower.includes(mapping.name.toLowerCase())) {
      matchingLobs.push(mapping.name);
    }
  }

  // Also check against local LOB mappings
  for (const [category, keywords] of Object.entries(lobColumnMappings)) {
    if (category.toLowerCase().includes(lobLower) ||
        keywords.some(k => k.toLowerCase().includes(lobLower)) ||
        lobLower.includes(category.toLowerCase())) {
      if (!matchingLobs.includes(category)) {
        matchingLobs.push(category);
      }
    }
  }

  // Also try direct match
  if (matchingLobs.length === 0) {
    matchingLobs = Array.from(insuranceData.allLobs).filter(l =>
      l.toLowerCase().includes(lobLower) || lobLower.includes(l.toLowerCase())
    );
  }

  console.log('Searching for LOBs:', matchingLobs, 'in state:', stateUpper);

  const matches = insuranceData.appetiteRecords.filter(record => {
    // State match: either ALL states or specific state
    const stateMatch = !state ||
      record.state === 'ALL' ||
      record.state === stateUpper ||
      record.statesOperatingIn?.toLowerCase().includes('all states');

    // LOB match
    const lobMatch = matchingLobs.length === 0 ||
      matchingLobs.some(ml => record.lob.toLowerCase() === ml.toLowerCase());

    return stateMatch && lobMatch;
  });

  // Remove duplicates (same carrier)
  const seen = new Set<string>();
  const unique = matches.filter(record => {
    if (seen.has(record.carrier)) return false;
    seen.add(record.carrier);
    return true;
  });

  console.log('Found', unique.length, 'matching carriers');

  return unique.slice(0, limit);
}

export function getCarrierDetails(carrierName: string): CarrierInfo | undefined {
  const nameLower = carrierName.toLowerCase();

  for (const [name, info] of insuranceData.carriers) {
    if (name.toLowerCase().includes(nameLower) || nameLower.includes(name.toLowerCase())) {
      return info;
    }
  }
  return undefined;
}

export function getCarrierRules(carrierName: string): RuleRecord[] {
  // For now, return empty - rules would come from a separate file
  return [];
}

export function getDataStats() {
  return {
    totalRecords: insuranceData.appetiteRecords.length,
    totalRules: insuranceData.ruleRecords.length,
    totalCarriers: insuranceData.carriers.size,
    totalStates: insuranceData.allStates.size,
    totalLobs: insuranceData.allLobs.size,
    loaded: insuranceData.loaded,
    loadedFromDB: insuranceData.loadedFromDB
  };
}

export function getAllCarriers(): string[] {
  return Array.from(insuranceData.allCarriers).sort();
}

export function getAllStates(): string[] {
  return Array.from(insuranceData.allStates).sort();
}

export function getAllLobs(): string[] {
  return Array.from(insuranceData.allLobs).sort();
}

export function getCarrierCoverageDetails(carrierName: string, lob: string): string {
  const carrier = getCarrierDetails(carrierName);
  if (!carrier) return '';

  let details: string[] = [];
  details.push(`States: ${carrier.statesOperatingIn}`);
  details.push(`Known For: ${carrier.knownFor}`);
  details.push(`Type: ${carrier.directOrWholesaler}`);

  // Get specific coverage info
  for (const [coverage, value] of carrier.coverages) {
    if (value && value.toLowerCase() !== 'no' && value.trim().length > 0) {
      if (coverage.toLowerCase().includes(lob.toLowerCase()) ||
          lob.toLowerCase().includes(coverage.toLowerCase().split(' ')[0])) {
        details.push(`${coverage}: ${value}`);
      }
    }
  }

  return details.join('\n');
}

// Check if loaded from database
export function isLoadedFromDatabase(): boolean {
  return insuranceData.loadedFromDB;
}
