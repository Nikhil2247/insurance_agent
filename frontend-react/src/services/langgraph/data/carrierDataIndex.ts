/**
 * Carrier Data Index - Firebase Only
 *
 * OPTIMIZATION STRATEGIES:
 * 1. Connection check uses limit(1) - only 1 read to verify Firebase
 * 2. Data loaded ONCE on startup with 30-minute cache
 * 3. Only fetches records with appetite_status != 'no'
 * 4. Subsequent queries use in-memory cache - zero Firebase reads
 *
 * Data Source: Firebase Firestore (aiReadyLongform collection)
 */

import {
  fetchAIReadyRecords,
  AIReadyRecord,
} from './firebaseDataService';

// Contact information for the agency
export const AGENCY_CONTACT = {
  email: 'productplacement@chambersbayins.com',
  name: 'Chambers Bay Insurance Group',
  placementDesk: 'Product Placement Team',
};

// Types for the AI_READY data (maps to Firebase carrierAppetite structure)
export interface CarrierAppetiteRecord {
  segment: string;
  carrier_raw: string;           // carrierName in Firebase
  carrier_key: string;           // carrierId in Firebase
  state_raw: string;             // statesOperatingIn in Firebase
  known_for: string;             // knownFor in Firebase
  lob_raw: string;               // coverageType in Firebase
  lob_key: string;               // coverageColumnName in Firebase
  appetite_raw: string;          // appetiteDetails in Firebase
  appetite_status: 'yes' | 'no' | 'conditional';  // hasAppetite in Firebase
  carrier_type: 'Direct' | 'Wholesaler' | 'MGA';  // carrierType in Firebase
  rule_signal_tags: string;
  needs_review: boolean;
}

// Types for Rules data
export interface CarrierRule {
  rule_id: string;
  carrier: string;
  lob: string;
  rule_type: string;
  operator: string;
  rule_value: string;
  severity: 'hard_stop' | 'soft_penalty';
  confidence: string;
  source_text: string;
}

// Indexed data structure for efficient lookup
interface IndexedData {
  // Index by LOB key -> list of carriers with appetite
  byLob: Map<string, CarrierAppetiteRecord[]>;
  // Index by carrier key -> all their LOB appetites
  byCarrier: Map<string, CarrierAppetiteRecord[]>;
  // Index by state -> carriers operating there
  byState: Map<string, Set<string>>;
  // Rules indexed by carrier+lob
  rules: Map<string, CarrierRule[]>;
  // All unique LOBs
  allLobs: Set<string>;
  // All unique carriers
  allCarriers: Set<string>;
  // Loaded flag
  loaded: boolean;
  // Data source (Firebase only)
  dataSource: 'firebase' | 'none';
}

const indexedData: IndexedData = {
  byLob: new Map(),
  byCarrier: new Map(),
  byState: new Map(),
  rules: new Map(),
  allLobs: new Set(),
  allCarriers: new Set(),
  loaded: false,
  dataSource: 'none',
};

// LOB category mappings for query normalization
// Keys should match Firebase coverageType/coverageColumnName values (lowercase)
// Aliases are what users might type in queries
const LOB_ALIASES: Record<string, string[]> = {
  // Personal Property - multiple key formats to match Firebase variations
  'home': ['home', 'ho3', 'homeowners', 'homeowner', 'house', 'owner-occupied'],
  'ho3': ['ho3', 'homeowners', 'home'],
  'homeowners': ['homeowners', 'homeowner', 'home insurance', 'owner-occupied', 'home policy'],
  'condo': ['condo', 'condominium', 'ho6', 'ho-6'],
  'renters': ['renters', 'renter', 'ho4', 'ho-4', 'tenant'],
  'renters ho4': ['renters', 'renter', 'ho4', 'tenant'],
  // Landlord/DP3 - important alias: "dwelling fire" maps here
  'landlord': ['landlord', 'dp3', 'dp-3', 'rental property', 'investment property', 'dwelling fire', 'tenant-occupied', 'tenant occupied'],
  'landlord/dp3': ['landlord', 'dp3', 'dwelling fire', 'tenant-occupied'],
  'dwelling fire': ['dwelling fire', 'landlord', 'dp3', 'tenant-occupied'],
  'manufactured homes': ['manufactured', 'mobile home', 'modular', 'manufactured home'],
  'manufactured home': ['manufactured', 'mobile home', 'modular'],

  // Auto - multiple formats
  'auto': ['auto', 'car', 'vehicle', 'personal auto', 'auto insurance', 'car insurance'],
  'personal auto': ['personal auto', 'auto insurance', 'car insurance', 'personalauto'],
  'personalauto': ['personal auto', 'personalauto', 'auto'],
  'motorcycle': ['motorcycle', 'motorbike'],
  'collector cars': ['collector', 'classic car', 'antique car', 'collector car'],
  'classic car': ['classic car', 'collector car', 'antique car'],

  // Commercial Lines - multiple formats to match Firebase naming
  'bop': ['bop', 'business owners policy', 'business owners', 'packaged', 'businessowners'],
  'business owners policy': ['business owners policy', 'bop', 'business owners', 'packaged polices'],
  'businessowners': ['bop', 'business owners', 'businessowners'],
  'packaged': ['packaged', 'bop', 'packaged polices'],
  'general liability': ['general liability', 'gl', 'liability insurance', 'liability', 'generalliability'],
  'generalliability': ['general liability', 'gl', 'generalliability'],
  'commercial auto': ['commercial auto', 'business auto', 'fleet', 'commercialauto', 'comm auto'],
  'commercialauto': ['commercial auto', 'commercialauto', 'business auto'],
  // Workers Comp - many variations
  'workers comp': ['workers comp', 'workers compensation', 'work comp', 'wc', 'workerscomp', 'workcomp', 'worker comp'],
  'workers compensation': ['workers compensation', 'workers comp', 'work comp', 'workerscompensation'],
  'workerscomp': ['workers comp', 'workerscomp', 'workers compensation'],
  'workerscompensation': ['workers compensation', 'workerscompensation', 'workers comp'],
  'workcomp': ['workers comp', 'workcomp', 'work comp'],
  // Commercial Property - many variations
  'commercial property': ['commercial property', 'business property', 'commercialproperty', 'comm property'],
  'commercialproperty': ['commercial property', 'commercialproperty', 'business property'],
  'business property': ['business property', 'commercial property'],

  // Specialty
  'umbrella': ['umbrella', 'excess liability', 'personal umbrella'],
  'flood': ['flood', 'flood insurance'],
  'earthquake': ['earthquake', 'quake'],
  'boat': ['boat', 'watercraft'],
  'yachts': ['yacht', 'yachts'],
  'jewelry floater': ['jewelry', 'personal article', 'valuables', 'jewelry floater'],
  'personal article floater': ['personal article', 'jewelry', 'valuables', 'floater'],
  'high net worth client': ['high net worth', 'hnw', 'affluent'],
};

// Parse states from state string
function parseStatesFromString(stateStr: string): string[] {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();

  if (upper.includes('ALL STATES') || upper.includes('ALL 50')) {
    return ['ALL'];
  }

  // Extract state abbreviations
  const matches = stateStr.match(/\b[A-Z]{2}\b/g);
  return matches || [];
}

// ============================================================================
// FIREBASE DATA LOADING (from aiReadyLongform collection)
// ============================================================================

/**
 * Transform AI Ready record to CarrierAppetiteRecord
 */
function transformAIReadyToRecord(record: AIReadyRecord): CarrierAppetiteRecord {
  // Normalize appetite status
  const statusLower = (record.appetite_status || '').toLowerCase();
  let appetiteStatus: 'yes' | 'no' | 'conditional' = 'yes';
  if (statusLower === 'no') appetiteStatus = 'no';
  else if (statusLower === 'conditional' || statusLower.includes('limit')) appetiteStatus = 'conditional';

  // Normalize carrier type
  const typeLower = (record.carrier_type || '').toLowerCase();
  let carrierType: 'Direct' | 'Wholesaler' | 'MGA' = 'Direct';
  if (typeLower.includes('wholesal')) carrierType = 'Wholesaler';
  else if (typeLower.includes('mga')) carrierType = 'MGA';

  return {
    segment: record.segment || 'personal',
    carrier_raw: record.carrier_raw,
    carrier_key: record.carrier_key,
    state_raw: record.state_raw,
    known_for: record.known_for,
    lob_raw: record.lob_raw,
    lob_key: record.lob_key,
    appetite_raw: record.appetite_raw,
    appetite_status: appetiteStatus,
    carrier_type: carrierType,
    rule_signal_tags: record.rule_signal_tags || '',
    needs_review: record.needs_review,
  };
}

/**
 * Load data from Firebase aiReadyLongform collection
 * This is the PRIMARY data source for the LangGraph agent
 */
export async function loadAllFromFirebase(): Promise<boolean> {
  try {
    console.log('[CarrierDataIndex] Loading from Firebase aiReadyLongform collection...');

    // Fetch from the AI Ready collection (matches CSV structure)
    const records = await fetchAIReadyRecords();

    if (records.length === 0) {
      console.warn('[CarrierDataIndex] No data found in Firebase aiReadyLongform');
      return false;
    }

    // Index the data
    for (const aiRecord of records) {
      const record = transformAIReadyToRecord(aiRecord);
      if (record.appetite_status === 'no') continue;

      const lobKey = record.lob_key;
      const carrierKey = record.carrier_key;

      if (lobKey) {
        if (!indexedData.byLob.has(lobKey)) {
          indexedData.byLob.set(lobKey, []);
        }
        indexedData.byLob.get(lobKey)!.push(record);
      }

      if (carrierKey) {
        if (!indexedData.byCarrier.has(carrierKey)) {
          indexedData.byCarrier.set(carrierKey, []);
        }
        indexedData.byCarrier.get(carrierKey)!.push(record);
      }

      const states = parseStatesFromString(record.state_raw);
      for (const state of states) {
        if (!indexedData.byState.has(state)) {
          indexedData.byState.set(state, new Set());
        }
        indexedData.byState.get(state)!.add(carrierKey);
      }

      if (lobKey) indexedData.allLobs.add(lobKey);
      if (carrierKey) indexedData.allCarriers.add(carrierKey);
    }

    indexedData.dataSource = 'firebase';
    console.log(`[CarrierDataIndex] Loaded ${records.length} records from Firebase`);
    console.log(`[CarrierDataIndex] Indexed: ${indexedData.allLobs.size} LOBs, ${indexedData.allCarriers.size} carriers`);

    return true;
  } catch (error) {
    console.error('[CarrierDataIndex] Firebase load failed:', error);
    return false;
  }
}

// ============================================================================
// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the data index - Firebase Only
 * Loads data from Firebase collections with caching (30 min TTL)
 * Tries aiReadyLongform first, falls back to carrierAppetites if empty
 */
export async function initializeDataIndex(): Promise<void> {
  if (indexedData.loaded) return;

  console.log('[CarrierDataIndex] Initializing data index (OPTIMIZED with caching)...');

  // Clear any existing data
  indexedData.byLob.clear();
  indexedData.byCarrier.clear();
  indexedData.byState.clear();
  indexedData.allLobs.clear();
  indexedData.allCarriers.clear();

  // Load from Firebase - fetchAIReadyRecords handles trying both collections
  // (aiReadyLongform first, then carrierAppetites as fallback)
  try {
    const loaded = await loadAllFromFirebase();
    if (!loaded) {
      throw new Error('Failed to load data from Firebase. No records found in aiReadyLongform or carrierAppetites collections.');
    }
  } catch (err) {
    console.error('[CarrierDataIndex] Firebase load failed:', err);
    throw new Error(`Firebase data load failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  indexedData.loaded = true;
  console.log(`[CarrierDataIndex] Data index ready (source: ${indexedData.dataSource})`);
  console.log(`[CarrierDataIndex] Stats: ${indexedData.allCarriers.size} carriers, ${indexedData.allLobs.size} LOBs`);
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Normalize a string for fuzzy matching (remove spaces, special chars)
 */
function normalizeForMatching(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalize user LOB query to match data keys
 */
export function normalizeLobQuery(userLob: string): string[] {
  const lower = userLob.toLowerCase().trim();
  const normalized = normalizeForMatching(userLob);
  const matchedLobs: string[] = [];

  // Check aliases first (with both exact and normalized matching)
  for (const [lobKey, aliases] of Object.entries(LOB_ALIASES)) {
    const keyNormalized = normalizeForMatching(lobKey);

    // Check if user query matches the key directly
    if (normalized.includes(keyNormalized) || keyNormalized.includes(normalized)) {
      if (!matchedLobs.includes(lobKey)) {
        matchedLobs.push(lobKey);
      }
    }

    // Check aliases
    for (const alias of aliases) {
      const aliasNormalized = normalizeForMatching(alias);
      if (normalized.includes(aliasNormalized) || aliasNormalized.includes(normalized) ||
          lower.includes(alias) || alias.includes(lower)) {
        if (!matchedLobs.includes(lobKey)) {
          matchedLobs.push(lobKey);
        }
        break;
      }
    }
  }

  // Also check direct match against indexed LOBs (the actual keys in Firebase data)
  for (const lob of indexedData.allLobs) {
    const lobNormalized = normalizeForMatching(lob);

    // Match with normalization (handles "workers comp" vs "workerscomp")
    if (lobNormalized.includes(normalized) || normalized.includes(lobNormalized) ||
        lob.includes(lower) || lower.includes(lob)) {
      if (!matchedLobs.includes(lob)) {
        matchedLobs.push(lob);
      }
    }
  }

  console.log(`[CarrierDataIndex] LOB query "${userLob}" matched: [${matchedLobs.join(', ')}]`);
  return matchedLobs.length > 0 ? matchedLobs : [lower];
}

/**
 * EFFICIENT QUERY: Get carriers for specific LOB
 * Data is pre-loaded and cached, so this is a fast O(1) lookup
 */
export function getCarriersForLob(lobKey: string): CarrierAppetiteRecord[] {
  const normalized = lobKey.toLowerCase().trim();
  return indexedData.byLob.get(normalized) || [];
}

/**
 * EFFICIENT QUERY: Get carriers for state + LOB combination
 * Data is pre-loaded and cached, so this is a fast lookup
 */
export function getCarriersForStateAndLob(
  state: string,
  lobQuery: string
): CarrierAppetiteRecord[] {
  const stateUpper = state.toUpperCase();
  const lobKeys = normalizeLobQuery(lobQuery);

  // Get carriers operating in this state
  const carriersInState = indexedData.byState.get(stateUpper) || new Set();
  const carriersInAll = indexedData.byState.get('ALL') || new Set();
  const eligibleCarriers = new Set([...carriersInState, ...carriersInAll]);

  // Get carriers with appetite for the LOB(s)
  const results: CarrierAppetiteRecord[] = [];
  const seen = new Set<string>();

  for (const lobKey of lobKeys) {
    const lobCarriers = indexedData.byLob.get(lobKey) || [];

    for (const record of lobCarriers) {
      // Only include if carrier operates in the state
      if (!state || eligibleCarriers.has(record.carrier_key) || eligibleCarriers.size === 0) {
        // Deduplicate by carrier
        if (!seen.has(record.carrier_key)) {
          seen.add(record.carrier_key);
          results.push(record);
        }
      }
    }
  }

  console.log(`[CarrierDataIndex] Query: state=${state}, lob=${lobQuery} -> ${results.length} carriers`);
  return results;
}

/**
 * EFFICIENT QUERY: Get rules for a specific carrier + LOB
 */
export function getRulesForCarrierLob(carrier: string, lob: string): CarrierRule[] {
  const key = `${carrier.toLowerCase()}:${lob.toLowerCase()}`;
  return indexedData.rules.get(key) || [];
}

/**
 * Get all carrier details by key
 */
export function getCarrierAppetites(carrierKey: string): CarrierAppetiteRecord[] {
  return indexedData.byCarrier.get(carrierKey.toLowerCase()) || [];
}

/**
 * Get data stats for debugging
 */
export function getIndexStats() {
  return {
    totalLobs: indexedData.allLobs.size,
    totalCarriers: indexedData.allCarriers.size,
    totalRules: Array.from(indexedData.rules.values()).reduce((sum, arr) => sum + arr.length, 0),
    lobIndex: indexedData.byLob.size,
    carrierIndex: indexedData.byCarrier.size,
    stateIndex: indexedData.byState.size,
    loaded: indexedData.loaded,
    dataSource: indexedData.dataSource,
  };
}

/**
 * Get all indexed LOB keys (for debugging)
 */
export function getAllLobKeys(): string[] {
  return Array.from(indexedData.allLobs);
}

/**
 * Check if data is loaded
 */
export function isDataLoaded(): boolean {
  return indexedData.loaded;
}

/**
 * Get the current data source
 */
export function getDataSource(): 'firebase' | 'none' {
  return indexedData.dataSource;
}

/**
 * Force reload from Firebase (clears cache and reloads)
 */
export async function forceReloadData(): Promise<void> {
  console.log('[CarrierDataIndex] Force reloading from Firebase...');

  // Clear existing data and cache
  indexedData.byLob.clear();
  indexedData.byCarrier.clear();
  indexedData.byState.clear();
  indexedData.allLobs.clear();
  indexedData.allCarriers.clear();
  indexedData.loaded = false;

  // Clear Firebase cache
  const { clearFirebaseCache } = await import('./firebaseDataService');
  clearFirebaseCache();

  const loaded = await loadAllFromFirebase();
  if (!loaded) {
    throw new Error('Failed to reload data from Firebase.');
  }

  indexedData.loaded = true;
  console.log(`[CarrierDataIndex] Reloaded: ${indexedData.allCarriers.size} carriers, ${indexedData.allLobs.size} LOBs`);
}
