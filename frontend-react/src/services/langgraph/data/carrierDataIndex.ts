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
// Keys should match the lob_key values in aiReadyLongform collection (lowercase)
// Aliases are what users might type in queries
const LOB_ALIASES: Record<string, string[]> = {
  // ===== HOME/PROPERTY =====
  // Primary key that matches seeded data
  'homeowners': [
    'homeowners', 'homeowner', 'home', 'house', 'owner-occupied', 'home insurance',
    'home policy', 'ho3', 'residential', 'dwelling'
  ],
  'ho3': ['ho3', 'homeowners', 'home'],
  'condo': ['condo', 'condominium', 'ho6', 'ho-6', 'condo insurance'],
  'renters': ['renters', 'renter', 'ho4', 'ho-4', 'tenant insurance', 'apartment'],
  // Landlord/DP3 - multiple entry points all map to 'landlord'
  'landlord': [
    'landlord', 'dp3', 'dp-3', 'rental property', 'investment property',
    'tenant-occupied', 'tenant occupied', 'rental home', 'rental insurance',
    'investor', 'non-owner occupied'
  ],
  'dwelling fire': ['dwelling fire', 'landlord', 'dp3', 'tenant-occupied'],
  // Manufactured homes
  'manufactured homes': [
    'manufactured', 'mobile home', 'modular', 'manufactured home',
    'mobile', 'trailer home', 'prefab'
  ],

  // ===== AUTO =====
  'auto': [
    'auto', 'car', 'vehicle', 'personal auto', 'auto insurance',
    'car insurance', 'automobile', 'ppa'
  ],
  'motorcycle': ['motorcycle', 'motorbike', 'bike'],
  'collector cars': ['collector', 'classic car', 'antique car', 'collector car', 'vintage'],

  // ===== COMMERCIAL LINES =====
  'bop': [
    'bop', 'business owners policy', 'business owners', 'packaged',
    'businessowners', 'small business', 'business insurance', 'commercial package'
  ],
  'general liability': [
    'general liability', 'gl', 'liability insurance', 'liability',
    'generalliability', 'commercial liability', 'cgl'
  ],
  'commercial auto': [
    'commercial auto', 'business auto', 'fleet', 'commercialauto',
    'comm auto', 'company vehicles', 'business vehicles', 'commercial vehicle'
  ],
  'workers compensation': [
    'workers comp', 'workers compensation', 'work comp', 'wc',
    'workerscomp', 'workcomp', 'worker comp', 'work injury', 'employee injury'
  ],
  'commercial property': [
    'commercial property', 'business property', 'commercialproperty',
    'comm property', 'business building', 'commercial building'
  ],

  // ===== SPECIALTY/LIABILITY =====
  'umbrella': ['umbrella', 'excess liability', 'personal umbrella', 'pup'],
  'flood': ['flood', 'flood insurance', 'flood policy'],
  'earthquake': ['earthquake', 'quake', 'seismic'],
  'boat': ['boat', 'watercraft', 'marine', 'vessel'],
  'yachts': ['yacht', 'yachts', 'large boat'],
  'rv': ['rv', 'recreational vehicle', 'motorhome', 'camper'],
  'atv': ['atv', 'utv', 'atv/utv', 'golf cart', 'golf carts', 'off-road'],
  'snowmobile': ['snowmobile', 'snow machine'],
  'jewelry floater': [
    'jewelry', 'personal article', 'valuables', 'jewelry floater',
    'fine jewelry', 'floater', 'scheduled items'
  ],
  'high net worth': ['high net worth', 'hnw', 'affluent', 'luxury home'],
  'short term rental': ['airbnb', 'vrbo', 'short term rental', 'vacation rental'],
  'pet': ['pet', 'pet insurance'],
  'travel': ['travel', 'travel insurance'],
};

// Parse states from state string
function parseStatesFromString(stateStr: string): string[] {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();

  // Recognize various "all states" patterns including CBIG-specific ones
  if (upper.includes('ALL STATES') ||
      upper.includes('ALL 50') ||
      upper.includes('CBIG') ||
      upper.includes('CBI ') ||
      upper.includes('ANY STATE')) {
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

  console.log(`[CarrierDataIndex] Query: state=${state}, lob=${lobQuery}, matched keys: [${lobKeys.join(', ')}]`);

  // Get carriers operating in this state
  const carriersInState = indexedData.byState.get(stateUpper) || new Set();
  const carriersInAll = indexedData.byState.get('ALL') || new Set();
  const eligibleCarriersByState = new Set([...carriersInState, ...carriersInAll]);

  // Get carriers with appetite for the LOB(s)
  const results: CarrierAppetiteRecord[] = [];
  const seen = new Set<string>();

  for (const lobKey of lobKeys) {
    const lobCarriers = indexedData.byLob.get(lobKey) || [];
    console.log(`[CarrierDataIndex] LOB key "${lobKey}" has ${lobCarriers.length} carriers`);

    for (const record of lobCarriers) {
      // Skip if already seen
      if (seen.has(record.carrier_key)) continue;

      // Check state eligibility
      let stateEligible = false;

      // If no state specified, include all carriers
      if (!state) {
        stateEligible = true;
      }
      // If carrier is in our state index (either specific state or ALL)
      else if (eligibleCarriersByState.has(record.carrier_key)) {
        stateEligible = true;
      }
      // If state index is empty (data issue), include all and filter later
      else if (eligibleCarriersByState.size === 0) {
        stateEligible = true;
      }
      // Check the state_raw field directly (for carriers not in index)
      else if (record.state_raw) {
        const stateRawUpper = record.state_raw.toUpperCase();
        if (stateRawUpper.includes('ALL STATES') ||
            stateRawUpper.includes('ALL 50') ||
            stateRawUpper.includes('CBIG') ||
            stateRawUpper.includes('CBI ') ||
            stateRawUpper.includes('ANY STATE') ||
            stateRawUpper.includes(stateUpper)) {
          stateEligible = true;
        }
      }
      // If state_raw is empty, assume all states (conservative)
      else if (!record.state_raw || record.state_raw.trim() === '') {
        stateEligible = true;
      }

      if (stateEligible) {
        seen.add(record.carrier_key);
        results.push(record);
      }
    }
  }

  // Log top results for debugging
  if (results.length > 0) {
    console.log(`[CarrierDataIndex] Found ${results.length} carriers. Top 5:`,
      results.slice(0, 5).map(r => `${r.carrier_raw} (${r.carrier_key})`).join(', ')
    );
  } else {
    console.warn(`[CarrierDataIndex] No carriers found for state=${state}, lob=${lobQuery}`);
    console.warn(`[CarrierDataIndex] Available LOBs:`, Array.from(indexedData.allLobs).slice(0, 20).join(', '));
  }

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
