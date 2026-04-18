/**
 * Firebase Data Service - OPTIMIZED for minimal reads
 *
 * Optimization strategies:
 * 1. Use limit(1) for connection checks instead of fetching all docs
 * 2. Aggressive in-memory caching with TTL
 * 3. Targeted queries by LOB - only fetch what's needed
 * 4. Cache results to prevent redundant reads
 *
 * Collections:
 * - carriers: id, name, knownFor, statesOperatingIn, type
 * - carrierAppetites: carrierId, carrierName, carrierType, coverageColumnName,
 *                     coverageType, hasAppetite, knownFor, statesOperatingIn, appetiteDetails
 * - coverageTypes: category, columnName, name
 */

import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

// ============================================================================
// Collection Names
// ============================================================================

// Get collection names from environment or use defaults
// The AI agent uses 'aiReadyLongform' collection (matches CBIG_AI_READY_LONGFORM.csv structure)
const COLLECTIONS = {
  CARRIERS: 'carriers',
  COVERAGE_TYPES: 'coverageTypes',
  CARRIER_APPETITES: 'carrierAppetites',
  // AI_READY is the main collection for the LangGraph agent
  AI_READY: import.meta.env.VITE_DB_COLLECTION_AI_READY || 'aiReadyLongform',
};

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache TTL

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache for carrier appetites by LOB
const appetiteCache = new Map<string, CacheEntry<FirebaseCarrierAppetite[]>>();

// Full data cache (only loaded once per session if needed)
let fullDataCache: CacheEntry<FirebaseCarrierAppetite[]> | null = null;

// Connection status cache
let connectionChecked = false;
let isConnected = false;

// ============================================================================
// Firebase Collection Types
// ============================================================================

export interface FirebaseCarrier {
  id: string;
  name: string;
  knownFor: string;
  statesOperatingIn: string;
  type: 'Direct' | 'Wholesaler' | 'MGA';
  createdAt?: any;
  updatedAt?: any;
}

export interface FirebaseCarrierAppetite {
  carrierId: string;
  carrierName: string;
  carrierType: string;
  coverageColumnName: string;
  coverageType: string;
  hasAppetite: boolean;
  knownFor: string;
  statesOperatingIn: string;
  appetiteDetails: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface FirebaseCoverageType {
  category: string;
  columnName: string;
  name: string;
}

// ============================================================================
// AI Ready Longform types (matches CBIG_AI_READY_LONGFORM.csv)
// ============================================================================

export interface AIReadyRecord {
  segment: string;
  carrier_raw: string;
  carrier_key: string;
  state_raw: string;
  known_for: string;
  lob_raw: string;
  lob_key: string;
  appetite_raw: string;
  appetite_status: string;
  carrier_type: string;
  rule_signal_tags: string;
  needs_review: boolean;
}

// ============================================================================
// Normalized types for internal use
// ============================================================================

export interface NormalizedCarrierRecord {
  segment: string;
  carrier_raw: string;
  carrier_key: string;
  state_raw: string;
  known_for: string;
  lob_raw: string;
  lob_key: string;
  appetite_raw: string;
  appetite_status: 'yes' | 'no' | 'conditional';
  carrier_type: 'Direct' | 'Wholesaler' | 'MGA';
  rule_signal_tags: string;
  needs_review: boolean;
}

// ============================================================================
// Cache Helper Functions
// ============================================================================

function isCacheValid<T>(entry: CacheEntry<T> | null | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function setCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear all caches (useful for forcing refresh)
 */
export function clearFirebaseCache(): void {
  appetiteCache.clear();
  fullDataCache = null;
  connectionChecked = false;
  console.log('[FirebaseData] Cache cleared');
}

// ============================================================================
// OPTIMIZED Firebase Data Fetching Functions
// ============================================================================

/**
 * Check if Firebase is configured and accessible
 * OPTIMIZED: Uses limit(1) - only 1 read instead of reading all documents!
 */
export async function checkFirebaseConnection(): Promise<boolean> {
  // Return cached result if we've already checked
  if (connectionChecked) {
    return isConnected;
  }

  try {
    console.log('[FirebaseData] Checking Firebase connection (optimized - limit 1)...');

    // Use limit(1) to only read ONE document instead of all
    const appetiteRef = collection(db, COLLECTIONS.CARRIER_APPETITES);
    const q = query(appetiteRef, limit(1));
    const snapshot = await getDocs(q);

    isConnected = snapshot.size > 0;
    connectionChecked = true;

    console.log(`[FirebaseData] Connection check: ${isConnected ? 'SUCCESS' : 'NO DATA'} (1 read only)`);
    return isConnected;
  } catch (error) {
    console.error('[FirebaseData] Firebase connection check failed:', error);
    connectionChecked = true;
    isConnected = false;
    return false;
  }
}

/**
 * Fetch carrier appetites for a specific LOB with appetite=true
 * OPTIMIZED: Targeted query with caching
 */
export async function fetchAppetitesByLob(lobName: string): Promise<FirebaseCarrierAppetite[]> {
  const cacheKey = `lob:${lobName.toLowerCase()}`;

  // Check cache first
  const cached = appetiteCache.get(cacheKey);
  if (isCacheValid(cached)) {
    console.log(`[FirebaseData] Cache HIT for LOB: ${lobName} (${cached!.data.length} records)`);
    return cached!.data;
  }

  try {
    console.log(`[FirebaseData] Fetching appetites for LOB: ${lobName} (targeted query)`);

    const appetitesRef = collection(db, COLLECTIONS.CARRIER_APPETITES);
    const q = query(
      appetitesRef,
      where('coverageType', '==', lobName),
      where('hasAppetite', '==', true)
    );
    const snapshot = await getDocs(q);

    const appetites: FirebaseCarrierAppetite[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      appetites.push({
        carrierId: data.carrierId || '',
        carrierName: data.carrierName || '',
        carrierType: data.carrierType || 'Direct',
        coverageColumnName: data.coverageColumnName || '',
        coverageType: data.coverageType || '',
        hasAppetite: true,
        knownFor: data.knownFor || '',
        statesOperatingIn: data.statesOperatingIn || '',
        appetiteDetails: data.appetiteDetails || '',
      });
    });

    // Cache the result
    setCacheEntry(appetiteCache, cacheKey, appetites);
    console.log(`[FirebaseData] Fetched ${appetites.length} carriers for LOB: ${lobName}`);

    return appetites;
  } catch (error) {
    console.error(`[FirebaseData] Error fetching appetites for LOB ${lobName}:`, error);
    throw error;
  }
}

/**
 * Fetch carriers with appetite for multiple LOBs at once
 * OPTIMIZED: Batch queries with caching
 */
export async function fetchAppetitesByLobs(lobNames: string[]): Promise<FirebaseCarrierAppetite[]> {
  const results: FirebaseCarrierAppetite[] = [];
  const uncachedLobs: string[] = [];

  // Check which LOBs are already cached
  for (const lob of lobNames) {
    const cacheKey = `lob:${lob.toLowerCase()}`;
    const cached = appetiteCache.get(cacheKey);
    if (isCacheValid(cached)) {
      results.push(...cached!.data);
    } else {
      uncachedLobs.push(lob);
    }
  }

  // Fetch uncached LOBs in parallel
  if (uncachedLobs.length > 0) {
    const fetchPromises = uncachedLobs.map(lob => fetchAppetitesByLob(lob));
    const fetched = await Promise.all(fetchPromises);
    fetched.forEach(appetites => results.push(...appetites));
  }

  return results;
}

/**
 * Fetch all carrier appetites - USE SPARINGLY!
 * OPTIMIZED: Caches result for 30 minutes
 */
export async function fetchCarrierAppetitesFromFirebase(): Promise<FirebaseCarrierAppetite[]> {
  // Check cache first
  if (isCacheValid(fullDataCache)) {
    console.log(`[FirebaseData] Full data cache HIT (${fullDataCache!.data.length} records)`);
    return fullDataCache!.data;
  }

  try {
    console.log('[FirebaseData] Fetching ALL carrier appetites (will cache for 30 min)...');

    // Fetch ALL records - filter client-side to handle different hasAppetite formats
    const appetitesRef = collection(db, COLLECTIONS.CARRIER_APPETITES);
    const snapshot = await getDocs(appetitesRef);

    const appetites: FirebaseCarrierAppetite[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      // Handle different hasAppetite formats: boolean true, string "true"/"yes"/"1", number 1
      const hasAppetite = data.hasAppetite === true ||
                          data.hasAppetite === 'true' ||
                          data.hasAppetite === 'yes' ||
                          data.hasAppetite === 'Yes' ||
                          data.hasAppetite === 'TRUE' ||
                          data.hasAppetite === 1 ||
                          data.hasAppetite === '1';

      // Only include records with appetite
      if (!hasAppetite) return;

      appetites.push({
        carrierId: data.carrierId || '',
        carrierName: data.carrierName || '',
        carrierType: data.carrierType || 'Direct',
        coverageColumnName: data.coverageColumnName || '',
        coverageType: data.coverageType || '',
        hasAppetite: true,
        knownFor: data.knownFor || '',
        statesOperatingIn: data.statesOperatingIn || '',
        appetiteDetails: data.appetiteDetails || '',
      });
    });

    console.log(`[FirebaseData] Total docs in collection: ${snapshot.size}, with appetite: ${appetites.length}`);

    // Cache the full result
    fullDataCache = { data: appetites, timestamp: Date.now() };

    // Also populate the per-LOB cache and log LOB names for debugging
    const byLob = new Map<string, FirebaseCarrierAppetite[]>();
    appetites.forEach(apt => {
      const lob = apt.coverageType.toLowerCase();
      if (!byLob.has(lob)) byLob.set(lob, []);
      byLob.get(lob)!.push(apt);
    });
    byLob.forEach((data, lob) => {
      setCacheEntry(appetiteCache, `lob:${lob}`, data);
    });

    // Log all unique LOBs found (helps debug LOB matching issues)
    console.log(`[FirebaseData] LOBs found: ${Array.from(byLob.keys()).join(', ')}`);
    console.log(`[FirebaseData] Cached ${appetites.length} carrier appetites (${byLob.size} LOBs)`);
    return appetites;
  } catch (error) {
    console.error('[FirebaseData] Error fetching carrier appetites:', error);
    throw error;
  }
}

// Cache for AI Ready records
let aiReadyCache: CacheEntry<AIReadyRecord[]> | null = null;

/**
 * Fetch AI Ready records from Firebase
 * Checks BOTH collections and uses the one with more records
 */
export async function fetchAIReadyRecords(): Promise<AIReadyRecord[]> {
  // Check cache first
  if (isCacheValid(aiReadyCache)) {
    console.log(`[FirebaseData] AI Ready cache HIT (${aiReadyCache!.data.length} records)`);
    return aiReadyCache!.data;
  }

  try {
    // Fetch from BOTH collections in parallel to compare
    console.log(`[FirebaseData] Checking both collections for data...`);
    const [aiReadyRecords, appetiteRecords] = await Promise.all([
      tryFetchFromCollection(COLLECTIONS.AI_READY),
      tryFetchFromCarrierAppetites(),
    ]);

    console.log(`[FirebaseData] ${COLLECTIONS.AI_READY}: ${aiReadyRecords.length} records`);
    console.log(`[FirebaseData] ${COLLECTIONS.CARRIER_APPETITES}: ${appetiteRecords.length} records`);

    // Use the collection with MORE records
    let records: AIReadyRecord[];
    let sourceCollection: string;

    if (appetiteRecords.length > aiReadyRecords.length) {
      records = appetiteRecords;
      sourceCollection = COLLECTIONS.CARRIER_APPETITES;
      console.log(`[FirebaseData] Using ${COLLECTIONS.CARRIER_APPETITES} (has more records)`);
    } else if (aiReadyRecords.length > 0) {
      records = aiReadyRecords;
      sourceCollection = COLLECTIONS.AI_READY;
      console.log(`[FirebaseData] Using ${COLLECTIONS.AI_READY}`);
    } else {
      records = [];
      sourceCollection = 'none';
      console.warn(`[FirebaseData] No records found in either collection!`);
    }

    // Cache the result
    aiReadyCache = { data: records, timestamp: Date.now() };

    // Log stats
    const uniqueLobs = new Set(records.map(r => r.lob_key));
    const uniqueCarriers = new Set(records.map(r => r.carrier_key));
    console.log(`[FirebaseData] Loaded ${records.length} records from ${sourceCollection}`);
    console.log(`[FirebaseData] Unique LOBs (${uniqueLobs.size}): ${Array.from(uniqueLobs).slice(0, 20).join(', ')}${uniqueLobs.size > 20 ? '...' : ''}`);
    console.log(`[FirebaseData] Unique carriers: ${uniqueCarriers.size}`);

    return records;
  } catch (error) {
    console.error(`[FirebaseData] Error fetching records:`, error);
    throw error;
  }
}

/**
 * Try to fetch from a collection with AI Ready structure
 */
async function tryFetchFromCollection(collectionName: string): Promise<AIReadyRecord[]> {
  try {
    console.log(`[FirebaseData] Fetching from ${collectionName}...`);
    const collectionRef = collection(db, collectionName);
    const snapshot = await getDocs(collectionRef);

    console.log(`[FirebaseData] ${collectionName} has ${snapshot.size} documents`);

    if (snapshot.size === 0) return [];

    // Log first document structure for debugging
    const firstDoc = snapshot.docs[0]?.data();
    if (firstDoc) {
      console.log(`[FirebaseData] Sample doc fields: ${Object.keys(firstDoc).join(', ')}`);
    }

    const records: AIReadyRecord[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      // Skip records with appetite_status = 'no'
      const status = (data.appetite_status || '').toLowerCase();
      if (status === 'no') return;

      records.push({
        segment: data.segment || 'personal',
        carrier_raw: data.carrier_raw || '',
        carrier_key: (data.carrier_key || '').toLowerCase(),
        state_raw: data.state_raw || '',
        known_for: data.known_for || '',
        lob_raw: data.lob_raw || '',
        lob_key: (data.lob_key || '').toLowerCase(),
        appetite_raw: data.appetite_raw || '',
        appetite_status: data.appetite_status || 'yes',
        carrier_type: data.carrier_type || 'Direct',
        rule_signal_tags: data.rule_signal_tags || '',
        needs_review: data.needs_review === true || data.needs_review === 'true',
      });
    });

    return records;
  } catch (error) {
    console.error(`[FirebaseData] Error fetching from ${collectionName}:`, error);
    return [];
  }
}

/**
 * Fetch from carrierAppetites collection (different field structure)
 */
async function tryFetchFromCarrierAppetites(): Promise<AIReadyRecord[]> {
  try {
    console.log(`[FirebaseData] Fetching from ${COLLECTIONS.CARRIER_APPETITES}...`);
    const collectionRef = collection(db, COLLECTIONS.CARRIER_APPETITES);
    const snapshot = await getDocs(collectionRef);

    console.log(`[FirebaseData] ${COLLECTIONS.CARRIER_APPETITES} has ${snapshot.size} documents`);

    if (snapshot.size === 0) return [];

    // Log first document structure for debugging
    const firstDoc = snapshot.docs[0]?.data();
    if (firstDoc) {
      console.log(`[FirebaseData] Sample doc fields: ${Object.keys(firstDoc).join(', ')}`);
    }

    const records: AIReadyRecord[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      // Handle different hasAppetite formats
      const hasAppetite = data.hasAppetite === true ||
                          data.hasAppetite === 'true' ||
                          data.hasAppetite === 'yes' ||
                          data.hasAppetite === 'Yes' ||
                          data.hasAppetite === 1;

      if (!hasAppetite) return;

      // Map carrierAppetites fields to AIReadyRecord structure
      const coverageType = (data.coverageType || '').toLowerCase();
      records.push({
        segment: coverageType.includes('commercial') ? 'commercial' : 'personal',
        carrier_raw: data.carrierName || '',
        carrier_key: (data.carrierId || '').toLowerCase(),
        state_raw: data.statesOperatingIn || '',
        known_for: data.knownFor || '',
        lob_raw: data.coverageType || '',
        lob_key: (data.coverageColumnName || data.coverageType || '').toLowerCase(),
        appetite_raw: data.appetiteDetails || '',
        appetite_status: 'yes',
        carrier_type: data.carrierType || 'Direct',
        rule_signal_tags: '',
        needs_review: false,
      });
    });

    return records;
  } catch (error) {
    console.error(`[FirebaseData] Error fetching from carrierAppetites:`, error);
    return [];
  }
}

/**
 * Check if AI Ready collection exists and has data
 */
export async function checkAIReadyCollection(): Promise<boolean> {
  try {
    const collectionRef = collection(db, COLLECTIONS.AI_READY);
    const q = query(collectionRef, limit(1));
    const snapshot = await getDocs(q);
    return snapshot.size > 0;
  } catch (error) {
    console.error('[FirebaseData] Error checking AI Ready collection:', error);
    return false;
  }
}

/**
 * Fetch all carriers - USE SPARINGLY!
 */
export async function fetchCarriersFromFirebase(): Promise<FirebaseCarrier[]> {
  try {
    const carriersRef = collection(db, COLLECTIONS.CARRIERS);
    const snapshot = await getDocs(carriersRef);

    const carriers: FirebaseCarrier[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      carriers.push({
        id: doc.id,
        name: data.name || '',
        knownFor: data.knownFor || '',
        statesOperatingIn: data.statesOperatingIn || '',
        type: normalizeCarrierType(data.type),
      });
    });

    console.log(`[FirebaseData] Fetched ${carriers.length} carriers`);
    return carriers;
  } catch (error) {
    console.error('[FirebaseData] Error fetching carriers:', error);
    throw error;
  }
}

/**
 * Fetch coverage types - USE SPARINGLY!
 */
export async function fetchCoverageTypesFromFirebase(): Promise<FirebaseCoverageType[]> {
  try {
    const coverageRef = collection(db, COLLECTIONS.COVERAGE_TYPES);
    const snapshot = await getDocs(coverageRef);

    const coverageTypes: FirebaseCoverageType[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      coverageTypes.push({
        category: data.category || '',
        columnName: data.columnName || '',
        name: data.name || '',
      });
    });

    console.log(`[FirebaseData] Fetched ${coverageTypes.length} coverage types`);
    return coverageTypes;
  } catch (error) {
    console.error('[FirebaseData] Error fetching coverage types:', error);
    throw error;
  }
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Convert Firebase carrier appetite to normalized record format
 */
export function transformToNormalizedRecord(
  appetite: FirebaseCarrierAppetite
): NormalizedCarrierRecord {
  return {
    segment: appetite.coverageType?.toLowerCase().includes('commercial') ? 'commercial' : 'personal',
    carrier_raw: appetite.carrierName,
    carrier_key: appetite.carrierId.toLowerCase(),
    state_raw: appetite.statesOperatingIn,
    known_for: appetite.knownFor,
    lob_raw: appetite.coverageType,
    lob_key: appetite.coverageColumnName?.toLowerCase() || appetite.coverageType?.toLowerCase() || '',
    appetite_raw: appetite.appetiteDetails,
    appetite_status: appetite.hasAppetite ? 'yes' : 'no',
    carrier_type: normalizeCarrierType(appetite.carrierType),
    rule_signal_tags: '',
    needs_review: false,
  };
}

/**
 * Normalize carrier type string to enum
 */
function normalizeCarrierType(type: string): 'Direct' | 'Wholesaler' | 'MGA' {
  const typeLower = (type || '').toLowerCase().trim();
  if (typeLower.includes('wholesal')) return 'Wholesaler';
  if (typeLower.includes('mga')) return 'MGA';
  return 'Direct';
}

/**
 * Fetch all data and transform to normalized records
 */
export async function fetchAllNormalizedRecords(): Promise<NormalizedCarrierRecord[]> {
  const appetites = await fetchCarrierAppetitesFromFirebase();
  return appetites.map(transformToNormalizedRecord);
}

// ============================================================================
// Stats function (for UI display)
// ============================================================================

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): { lobsCached: number; fullDataCached: boolean; connectionChecked: boolean } {
  return {
    lobsCached: appetiteCache.size,
    fullDataCached: isCacheValid(fullDataCache),
    connectionChecked,
  };
}
