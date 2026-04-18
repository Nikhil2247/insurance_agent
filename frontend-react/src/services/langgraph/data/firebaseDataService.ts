/**
 * Firebase Data Service - OPTIMIZED for minimal reads
 *
 * Optimization strategies:
 * 1. Use limit(1) for connection checks instead of fetching all docs
 * 2. Aggressive in-memory + localStorage caching with TTL
 * 3. Single collection fetch (aiReadyLongform only, fallback to carrierAppetites)
 * 4. Singleton fetch pattern - prevents duplicate parallel fetches
 * 5. Cache persists across page reloads via localStorage
 * 6. 2-hour cache TTL to minimize reads
 *
 * FIRESTORE READS PER SESSION:
 * - First load: 1 query (all records from aiReadyLongform)
 * - Subsequent queries: 0 (all from cache)
 * - After 2 hours: 1 query (refresh cache)
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

const COLLECTIONS = {
  CARRIERS: 'carriers',
  COVERAGE_TYPES: 'coverageTypes',
  CARRIER_APPETITES: 'carrierAppetites',
  AI_READY: import.meta.env.VITE_DB_COLLECTION_AI_READY || 'aiReadyLongform',
};

// ============================================================================
// Cache Configuration - OPTIMIZED
// ============================================================================

// 2 hours cache TTL (reduced Firestore reads significantly)
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const LOCALSTORAGE_KEY = 'cbig_carrier_data_cache';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  source?: string;
}

// In-memory cache for carrier appetites by LOB
const appetiteCache = new Map<string, CacheEntry<FirebaseCarrierAppetite[]>>();

// Full data cache (only loaded once per session if needed)
let fullDataCache: CacheEntry<FirebaseCarrierAppetite[]> | null = null;

// Connection status cache
let connectionChecked = false;
let isConnected = false;

// Singleton fetch promise to prevent duplicate parallel fetches
let fetchInProgress: Promise<AIReadyRecord[]> | null = null;

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

// ============================================================================
// LocalStorage Cache Functions (persist across page reloads)
// ============================================================================

interface LocalStorageCache {
  records: AIReadyRecord[];
  timestamp: number;
  source: string;
  version: string;
}

const CACHE_VERSION = '1.0';

/**
 * Save records to localStorage for persistence across page reloads
 */
function saveToLocalStorage(records: AIReadyRecord[], source: string): void {
  try {
    const cache: LocalStorageCache = {
      records,
      timestamp: Date.now(),
      source,
      version: CACHE_VERSION,
    };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(cache));
    console.log(`[FirebaseData] Saved ${records.length} records to localStorage`);
  } catch (error) {
    // localStorage might be full or disabled
    console.warn('[FirebaseData] Could not save to localStorage:', error);
  }
}

/**
 * Load records from localStorage if cache is still valid
 */
function loadFromLocalStorage(): AIReadyRecord[] | null {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!cached) return null;

    const cache: LocalStorageCache = JSON.parse(cached);

    // Check version compatibility
    if (cache.version !== CACHE_VERSION) {
      console.log('[FirebaseData] Cache version mismatch, clearing');
      localStorage.removeItem(LOCALSTORAGE_KEY);
      return null;
    }

    // Check TTL
    if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
      console.log('[FirebaseData] localStorage cache expired');
      return null;
    }

    console.log(`[FirebaseData] Loaded ${cache.records.length} records from localStorage (source: ${cache.source})`);
    return cache.records;
  } catch (error) {
    console.warn('[FirebaseData] Could not load from localStorage:', error);
    return null;
  }
}

/**
 * Clear all caches (useful for forcing refresh)
 */
export function clearFirebaseCache(): void {
  appetiteCache.clear();
  fullDataCache = null;
  connectionChecked = false;
  fetchInProgress = null;
  try {
    localStorage.removeItem(LOCALSTORAGE_KEY);
  } catch (e) {
    // Ignore localStorage errors
  }
  console.log('[FirebaseData] All caches cleared (memory + localStorage)');
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

// Cache for AI Ready records (in-memory)
let aiReadyCache: CacheEntry<AIReadyRecord[]> | null = null;

/**
 * Fetch AI Ready records - OPTIMIZED
 *
 * Strategy:
 * 1. Check in-memory cache first (fastest)
 * 2. Check localStorage cache (survives page reload)
 * 3. If fetch in progress, wait for it (singleton pattern)
 * 4. Fetch from aiReadyLongform ONLY (no parallel fetches)
 * 5. Fallback to carrierAppetites only if primary is empty
 *
 * FIRESTORE READS: Maximum 1-2 per 2 hours
 */
export async function fetchAIReadyRecords(): Promise<AIReadyRecord[]> {
  // 1. Check in-memory cache first (fastest)
  if (isCacheValid(aiReadyCache)) {
    console.log(`[FirebaseData] Memory cache HIT (${aiReadyCache!.data.length} records) - 0 Firestore reads`);
    return aiReadyCache!.data;
  }

  // 2. Check localStorage cache (survives page reload)
  const localRecords = loadFromLocalStorage();
  if (localRecords && localRecords.length > 0) {
    // Populate in-memory cache from localStorage
    aiReadyCache = { data: localRecords, timestamp: Date.now() };
    console.log(`[FirebaseData] localStorage cache HIT - 0 Firestore reads`);
    return localRecords;
  }

  // 3. If fetch is already in progress, wait for it (singleton pattern)
  if (fetchInProgress) {
    console.log('[FirebaseData] Fetch already in progress, waiting...');
    return fetchInProgress;
  }

  // 4. Start new fetch (will be shared by any concurrent callers)
  fetchInProgress = (async () => {
    try {
      console.log(`[FirebaseData] Fetching from Firestore (1 query)...`);

      // Try primary collection first (aiReadyLongform)
      let records = await tryFetchFromCollection(COLLECTIONS.AI_READY);
      let sourceCollection = COLLECTIONS.AI_READY;

      // Only fallback to carrierAppetites if primary is empty
      if (records.length === 0) {
        console.log(`[FirebaseData] Primary collection empty, trying fallback...`);
        records = await tryFetchFromCarrierAppetites();
        sourceCollection = COLLECTIONS.CARRIER_APPETITES;
      }

      if (records.length === 0) {
        console.warn(`[FirebaseData] No records found in any collection!`);
        return [];
      }

      // Cache in memory
      aiReadyCache = { data: records, timestamp: Date.now(), source: sourceCollection };

      // Cache in localStorage for persistence
      saveToLocalStorage(records, sourceCollection);

      // Log stats
      const uniqueLobs = new Set(records.map(r => r.lob_key));
      const uniqueCarriers = new Set(records.map(r => r.carrier_key));
      console.log(`[FirebaseData] Loaded ${records.length} records from ${sourceCollection}`);
      console.log(`[FirebaseData] Unique LOBs: ${uniqueLobs.size}, Unique carriers: ${uniqueCarriers.size}`);

      return records;
    } finally {
      // Clear the singleton promise
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
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
export function getCacheStats(): {
  lobsCached: number;
  fullDataCached: boolean;
  connectionChecked: boolean;
  aiReadyCached: boolean;
  localStorageCached: boolean;
  cacheAge: number | null;
} {
  let localStorageCached = false;
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      localStorageCached = Date.now() - parsed.timestamp < CACHE_TTL_MS;
    }
  } catch (e) {
    // Ignore
  }

  return {
    lobsCached: appetiteCache.size,
    fullDataCached: isCacheValid(fullDataCache),
    connectionChecked,
    aiReadyCached: isCacheValid(aiReadyCache),
    localStorageCached,
    cacheAge: aiReadyCache ? Math.round((Date.now() - aiReadyCache.timestamp) / 60000) : null,
  };
}

/**
 * Preload data on app startup (call this early in app initialization)
 * This ensures data is cached before first user query
 */
export async function preloadCarrierData(): Promise<void> {
  console.log('[FirebaseData] Preloading carrier data...');
  try {
    await fetchAIReadyRecords();
    console.log('[FirebaseData] Preload complete');
  } catch (error) {
    console.error('[FirebaseData] Preload failed:', error);
  }
}

/**
 * Get cache TTL info for display
 */
export function getCacheTTLInfo(): { ttlHours: number; expiresIn: number | null } {
  const ttlHours = CACHE_TTL_MS / (60 * 60 * 1000);
  let expiresIn: number | null = null;

  if (aiReadyCache) {
    const elapsed = Date.now() - aiReadyCache.timestamp;
    const remaining = CACHE_TTL_MS - elapsed;
    expiresIn = Math.max(0, Math.round(remaining / 60000)); // minutes
  }

  return { ttlHours, expiresIn };
}
