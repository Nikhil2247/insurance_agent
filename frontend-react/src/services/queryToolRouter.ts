import Papa from 'papaparse';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  loadInsuranceData,
  searchCarriers,
  getCarrierCoverageDetails,
  getDataStats,
  getAllCarriers,
  isLoadedFromDatabase,
  isDatabaseModePaused,
  getCarrierAppetiteCsvPath,
  AppetiteRecord,
} from './insuranceData';

export interface ToolRoutingInput {
  query: string;
  state?: string;
  lob?: string;
  limit?: number;
  coverageAmount?: number;
}

export interface ToolRoutingResult {
  intent: 'placement' | 'rules' | 'analytics' | 'diagnostic';
  usedTools: string[];
  contextBlock: string;
  allowedCarriers: string[];
  rankedCandidates: RankedCandidate[];
}

export interface RankedCandidate {
  carrier: string;
  matchScore: number;
  appetiteStatus: 'Strong Appetite' | 'Moderate Appetite' | 'Limited Appetite' | 'Conditional';
  type: string;
  statesOperatingIn: string;
  knownFor: string;
  rationale: string[];
}

interface AiReadyRow {
  carrier_raw?: string;
  state_raw?: string;
  known_for?: string;
  lob_raw?: string;
  appetite_raw?: string;
  appetite_status?: string;
  [key: string]: string | undefined;
}

interface RuleRow {
  carrier_raw?: string;
  lob_raw?: string;
  rule_type?: string;
  operator?: string;
  rule_value?: string;
  severity?: string;
  confidence?: string;
  source_text?: string;
  resolution_status?: string;
  [key: string]: string | undefined;
}

const AI_READY_DATA_PATH = '/data/CBIG_AI_READY_LONGFORM.csv';
const RULES_DATA_PATH = '/data/CBIG_STRUCTURED_RULE_CANDIDATES.csv';
const DB_AI_READY_COLLECTION = import.meta.env.VITE_DB_COLLECTION_AI_READY || 'aiReadyLongform';
const DB_RULES_COLLECTION = import.meta.env.VITE_DB_COLLECTION_RULE_CANDIDATES || 'structuredRuleCandidates';

let aiReadyRowsCache: AiReadyRow[] | null = null;
let rulesRowsCache: RuleRow[] | null = null;
let aiReadyRowsDbCache: AiReadyRow[] | null = null;
let rulesRowsDbCache: RuleRow[] | null = null;
let lastAiReadySource: 'db' | 'csv' | 'none' = 'none';
let lastRulesSource: 'db' | 'csv' | 'none' = 'none';

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function includesNormalized(haystack: string | undefined, needle: string): boolean {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

function mapAppetiteStatus(raw: string | undefined): RankedCandidate['appetiteStatus'] {
  const v = normalize(raw || '');
  if (v === 'yes' || v.includes('strong')) return 'Strong Appetite';
  if (v.includes('conditional')) return 'Conditional';
  if (v.includes('limited')) return 'Limited Appetite';
  if (v.includes('no')) return 'Limited Appetite';
  return 'Moderate Appetite';
}

function extractAiReadyStatus(
  aiRows: AiReadyRow[],
  carrier: string,
  state: string,
  lob: string,
): string {
  const carrierLower = normalize(carrier);
  const stateLower = normalize(state);
  const lobLower = normalize(lob);

  const matches = aiRows.filter((row) => {
    const carrierMatch = normalize(row.carrier_raw || '') === carrierLower;
    const lobMatch = !lobLower || includesNormalized(row.lob_raw, lobLower);
    const stateMatch = !stateLower || includesNormalized(row.state_raw, stateLower);
    return carrierMatch && lobMatch && stateMatch;
  });

  if (matches.length === 0) return '';

  if (matches.some((m) => normalize(m.appetite_status || '').includes('yes'))) {
    return 'yes';
  }
  if (matches.some((m) => normalize(m.appetite_status || '').includes('conditional'))) {
    return 'conditional';
  }
  if (matches.some((m) => normalize(m.appetite_status || '').includes('limited'))) {
    return 'limited';
  }
  return matches[0].appetite_status || '';
}

function countHardStops(ruleRows: RuleRow[], carrier: string, lob: string, state: string): number {
  const carrierLower = normalize(carrier);
  const lobLower = normalize(lob);
  const stateLower = normalize(state);

  return ruleRows.filter((row) => {
    const carrierMatch = normalize(row.carrier_raw || '') === carrierLower;
    const lobMatch = !lobLower || includesNormalized(row.lob_raw, lobLower);
    const severityMatch = normalize(row.severity || '') === 'hard_stop';
    const stateMatch = !stateLower || includesNormalized(row.rule_value, stateLower) || includesNormalized(row.source_text, stateLower);
    return carrierMatch && lobMatch && severityMatch && stateMatch;
  }).length;
}

// Preferred carriers list based on production relationships (higher priority)
const PREFERRED_CARRIERS: Record<string, number> = {
  // Top tier - highest production
  'safeco': 12,
  'travelers': 11,
  'geico': 11,

  // Second tier
  'orion 180': 10,
  'germania': 9,
  'south & western': 9,

  // Third tier
  'foremost signature': 8,
  'foremost star': 8,
  'foremost': 8,
  'mercury': 8,
  'lemonade': 7,
  'nationwide': 7,
  'hartford': 7,

  // Specialty
  'hagerty': 10,
  'grundy': 9,
  'usli': 8,
  'berkshire hathaway': 7,
  'berkshire hathaway guard': 7,

  // Standard
  'allstate': 5,
  'aegis': 5,
  'american modern': 6,
  'mapfre': 6,
  'state auto': 6,
  'philadelphia': 6,
  'aspera': 5,
  'berkley north pacific': 7,
  'attune': 6,
  'btis': 6,
  'orchid': 6,
  'national general': 6,
  'appalachian underwriters': 6,
};

function rankPlacementCandidates(
  records: AppetiteRecord[],
  aiRows: AiReadyRow[],
  ruleRows: RuleRow[],
  state: string,
  lob: string,
  coverageAmount?: number,
): RankedCandidate[] {
  const ranked = records.map((record) => {
    // Start with base score of 50 (will result in 0.50-0.90 range)
    let score = 50;
    const rationale: string[] = [];
    const carrierLower = normalize(record.carrier);

    // === PREFERRED CARRIER BONUS (Production relationships) ===
    const preferredBonus = PREFERRED_CARRIERS[carrierLower] || 0;
    if (preferredBonus > 0) {
      score += preferredBonus;
      rationale.push('strong production relationship');
    }

    // === CARRIER TYPE SCORING ===
    const typeLower = normalize(record.directOrWholesaler || '');
    if (typeLower.includes('direct') && !typeLower.includes('wholesaler')) {
      score += 8;
      rationale.push('direct market access');
    } else if (typeLower.includes('direct via wholesaler')) {
      score += 5;
      rationale.push('direct-via-wholesaler');
    } else if (typeLower.includes('wholesaler')) {
      score += 2;
      rationale.push('wholesale/E&S path');
    }

    // === STATE MATCHING ===
    const statesText = record.statesOperatingIn || '';
    const statesLower = normalize(statesText);

    // State-specific carrier (like "TX only")
    const isStateOnly = statesLower.includes(`${state.toLowerCase()} only`) ||
                        statesLower.includes('texas only') ||
                        (statesLower.includes('only') && includesNormalized(statesText, state));

    if (isStateOnly) {
      score += 10;
      rationale.push(`${state}-specialized carrier`);
    } else if (includesNormalized(statesText, state)) {
      // Check if it's a focused regional carrier vs nationwide
      const stateCount = (statesText.match(/\b[A-Z]{2}\b/g) || []).length;
      if (stateCount > 0 && stateCount <= 10) {
        score += 7;
        rationale.push(`regional carrier in ${state}`);
      } else {
        score += 5;
        rationale.push(`operates in ${state}`);
      }
    } else if (statesLower.includes('all states')) {
      score += 4;
      rationale.push('nationwide coverage');
    }

    // === LOB/KNOWN-FOR MATCHING ===
    const knownFor = normalize(record.knownFor || '');
    const lobLower = normalize(lob || '');

    // Check multiple home-related keywords
    const homeKeywords = ['home', 'homeowners', 'dwelling', 'ho3', 'residential'];
    const autoKeywords = ['auto', 'car', 'vehicle'];
    const umbrellaKeywords = ['umbrella', 'excess', 'liability'];
    const floodKeywords = ['flood'];
    const boatKeywords = ['boat', 'watercraft', 'marine', 'yacht'];

    let lobMatch = false;
    if (lobLower.includes('home') || lobLower.includes('dwelling')) {
      lobMatch = homeKeywords.some(k => knownFor.includes(k));
    } else if (lobLower.includes('auto')) {
      lobMatch = autoKeywords.some(k => knownFor.includes(k));
    } else if (lobLower.includes('umbrella')) {
      lobMatch = umbrellaKeywords.some(k => knownFor.includes(k));
    } else if (lobLower.includes('flood')) {
      lobMatch = floodKeywords.some(k => knownFor.includes(k));
    } else if (lobLower.includes('boat')) {
      lobMatch = boatKeywords.some(k => knownFor.includes(k));
    } else {
      lobMatch = knownFor.includes(lobLower);
    }

    if (lobMatch) {
      score += 8;
      rationale.push(`specializes in ${lob}`);
    }

    // === COVERAGE AMOUNT ANALYSIS ===
    const detailText = normalize(record.details || '');

    if (coverageAmount) {
      // Check for coverage limit restrictions
      const limitMatch = detailText.match(/(\d+)k|<\s*\$?\s*(\d[\d,]*)/i);
      if (limitMatch) {
        const limitValue = limitMatch[1]
          ? parseInt(limitMatch[1]) * 1000
          : parseInt((limitMatch[2] || '0').replace(/,/g, ''));

        if (limitValue > 0 && coverageAmount > limitValue) {
          score -= 15;
          rationale.push(`coverage may exceed ${limitValue.toLocaleString()} limit`);
        }
      }

      // High-value specialist bonus
      if (coverageAmount >= 1000000 && knownFor.includes('high')) {
        score += 5;
        rationale.push('high-value specialist');
      }
    }

    // === APPETITE STATUS ===
    const aiStatusRaw = extractAiReadyStatus(aiRows, record.carrier, state, lob);
    const appetiteStatus = mapAppetiteStatus(aiStatusRaw || record.appetite);

    if (appetiteStatus === 'Strong Appetite') {
      score += 6;
      rationale.push('confirmed appetite');
    } else if (appetiteStatus === 'Moderate Appetite') {
      score += 3;
    } else if (appetiteStatus === 'Conditional') {
      score += 1;
      rationale.push('conditional appetite');
    } else if (appetiteStatus === 'Limited Appetite') {
      score -= 10;
      rationale.push('limited appetite');
    }

    // === HARD STOP RULES ===
    const hardStops = countHardStops(ruleRows, record.carrier, lob, state);
    if (hardStops > 0) {
      score -= Math.min(30, hardStops * 10);
      rationale.push(`${hardStops} restriction(s)`);
    }

    // === FINAL SCORE (scale to 0.50-0.95 range) ===
    // Raw score is roughly 50-95, normalize to percentage
    const bounded = Math.max(50, Math.min(95, score));

    return {
      carrier: record.carrier,
      matchScore: bounded,
      appetiteStatus,
      type: record.directOrWholesaler,
      statesOperatingIn: record.statesOperatingIn,
      knownFor: record.knownFor,
      rationale,
    } as RankedCandidate;
  });

  // Sort by score (descending), then by preferred carrier status, then Direct before Wholesaler
  return ranked
    .sort((a, b) => {
      // Primary: score
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      // Secondary: preferred carrier
      const aPref = PREFERRED_CARRIERS[normalize(a.carrier)] || 0;
      const bPref = PREFERRED_CARRIERS[normalize(b.carrier)] || 0;
      if (bPref !== aPref) {
        return bPref - aPref;
      }
      // Tertiary: Direct before Wholesaler
      const aIsDirect = normalize(a.type || '').includes('direct') && !normalize(a.type || '').includes('wholesaler');
      const bIsDirect = normalize(b.type || '').includes('direct') && !normalize(b.type || '').includes('wholesaler');
      if (aIsDirect && !bIsDirect) return -1;
      if (!aIsDirect && bIsDirect) return 1;
      return 0;
    })
    .filter((item, idx, arr) => arr.findIndex((x) => normalize(x.carrier) === normalize(item.carrier)) === idx);
}

function detectIntent(query: string): ToolRoutingResult['intent'] {
  const q = normalize(query);

  const diagnosticKeywords = [
    'raw input',
    'data output',
    'database enabled',
    'data source',
    'which file',
    'which dataset',
    'using db',
  ];

  const rulesKeywords = [
    'rule',
    'restriction',
    'eligibility',
    'excluded',
    'county',
    'limit',
    'underwriting note',
    'guideline',
  ];

  const analyticsKeywords = [
    'summary',
    'trend',
    'count',
    'report',
    'market insight',
    'analysis',
    'data output',
  ];

  if (diagnosticKeywords.some((k) => q.includes(k))) {
    return 'diagnostic';
  }

  if (rulesKeywords.some((k) => q.includes(k))) {
    return 'rules';
  }

  if (analyticsKeywords.some((k) => q.includes(k))) {
    return 'analytics';
  }

  return 'placement';
}

async function loadCsvRows<T extends Record<string, unknown>>(path: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(path, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve((results.data || []) as T[]);
      },
      error: (error) => reject(error),
    });
  });
}

async function getAiReadyRows(): Promise<AiReadyRow[]> {
  if (!isDatabaseModePaused()) {
    if (aiReadyRowsDbCache) {
      lastAiReadySource = 'db';
      return aiReadyRowsDbCache;
    }

    try {
      const snapshot = await getDocs(collection(db, DB_AI_READY_COLLECTION));
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          carrier_raw: String(data.carrier_raw || data.carrierName || ''),
          state_raw: String(data.state_raw || data.state || ''),
          known_for: String(data.known_for || data.knownFor || ''),
          lob_raw: String(data.lob_raw || data.lob || data.coverageType || ''),
          appetite_raw: String(data.appetite_raw || data.appetite || ''),
          appetite_status: String(data.appetite_status || data.appetiteStatus || ''),
        } as AiReadyRow;
      });

      if (rows.length > 0) {
        aiReadyRowsDbCache = rows;
        lastAiReadySource = 'db';
        return rows;
      }
    } catch (_error) {
      // Fallback to CSV if DB collection is unavailable.
    }
  }

  if (aiReadyRowsCache) {
    lastAiReadySource = 'csv';
    return aiReadyRowsCache;
  }

  aiReadyRowsCache = await loadCsvRows<AiReadyRow>(AI_READY_DATA_PATH);
  lastAiReadySource = aiReadyRowsCache.length > 0 ? 'csv' : 'none';
  return aiReadyRowsCache;
}

async function getRuleRows(): Promise<RuleRow[]> {
  if (!isDatabaseModePaused()) {
    if (rulesRowsDbCache) {
      lastRulesSource = 'db';
      return rulesRowsDbCache;
    }

    try {
      const snapshot = await getDocs(collection(db, DB_RULES_COLLECTION));
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          carrier_raw: String(data.carrier_raw || data.carrierName || ''),
          lob_raw: String(data.lob_raw || data.lob || ''),
          rule_type: String(data.rule_type || data.ruleType || ''),
          operator: String(data.operator || ''),
          rule_value: String(data.rule_value || data.ruleValue || ''),
          severity: String(data.severity || ''),
          confidence: String(data.confidence || ''),
          source_text: String(data.source_text || data.sourceText || ''),
          resolution_status: String(data.resolution_status || data.resolutionStatus || ''),
        } as RuleRow;
      });

      if (rows.length > 0) {
        rulesRowsDbCache = rows;
        lastRulesSource = 'db';
        return rows;
      }
    } catch (_error) {
      // Fallback to CSV if DB collection is unavailable.
    }
  }

  if (rulesRowsCache) {
    lastRulesSource = 'csv';
    return rulesRowsCache;
  }

  rulesRowsCache = await loadCsvRows<RuleRow>(RULES_DATA_PATH);
  lastRulesSource = rulesRowsCache.length > 0 ? 'csv' : 'none';
  return rulesRowsCache;
}

function findCarrierMention(query: string): string {
  const carriers = getAllCarriers();
  const lowerQuery = normalize(query);

  for (const carrier of carriers) {
    if (lowerQuery.includes(normalize(carrier))) {
      return carrier;
    }
  }

  return '';
}

function formatPlacementContext(ranked: RankedCandidate[], state: string, lob: string): string {
  if (ranked.length === 0) {
    return `No matching carrier appetite records were found for state=${state || 'N/A'}, lob=${lob || 'N/A'}.`;
  }

  let out = `## Placement Tool Results\n`;
  out += `Matched carriers: ${ranked.length}\n\n`;
  out += `ALLOWED_CARRIERS: ${ranked.map((r) => r.carrier).join(', ')}\n\n`;

  ranked.slice(0, 15).forEach((record, index) => {
    out += `### ${index + 1}. ${record.carrier}\n`;
    out += `- Match Score: ${record.matchScore}\n`;
    out += `- Appetite Status: ${record.appetiteStatus}\n`;
    out += `- States: ${record.statesOperatingIn || 'N/A'}\n`;
    out += `- Known For: ${record.knownFor || 'N/A'}\n`;
    out += `- Type: ${record.type || 'N/A'}\n`;
    out += `- Rationale: ${record.rationale.slice(0, 3).join('; ')}\n`;

    const detailLines = getCarrierCoverageDetails(record.carrier, lob)
      .split('\n')
      .filter((line) => line && !line.startsWith('States:') && !line.startsWith('Known For:') && !line.startsWith('Type:'));

    if (detailLines.length > 0) {
      out += `- Coverage Notes: ${detailLines.join('; ')}\n`;
    }

    out += '\n';
  });

  return out;
}

async function executeRulesTool(state: string, lob: string, carrierHint: string): Promise<string> {
  const rows = await getRuleRows();

  const filtered = rows.filter((row) => {
    const carrierMatch = !carrierHint || includesNormalized(row.carrier_raw, carrierHint);
    const lobMatch = !lob || includesNormalized(row.lob_raw, lob);
    const stateMatch = !state || includesNormalized(row.rule_value, state) || includesNormalized(row.source_text, state);

    return carrierMatch && lobMatch && stateMatch;
  });

  if (filtered.length === 0) {
    return '## Rules Tool Results\nNo structured rule candidates matched the current query filters.';
  }

  let out = `## Rules Tool Results\nMatched rule candidates: ${filtered.length}\n\n`;

  filtered.slice(0, 20).forEach((row, index) => {
    out += `${index + 1}. carrier=${row.carrier_raw || 'N/A'} | lob=${row.lob_raw || 'N/A'} | type=${row.rule_type || 'N/A'} | severity=${row.severity || 'N/A'}\n`;
    out += `   source: ${row.source_text || 'N/A'}\n`;
  });

  return out;
}

async function executeAnalyticsTool(state: string, lob: string): Promise<string> {
  const rows = await getAiReadyRows();

  const filtered = rows.filter((row) => {
    const stateMatch = !state || includesNormalized(row.state_raw, state);
    const lobMatch = !lob || includesNormalized(row.lob_raw, lob);
    return stateMatch && lobMatch;
  });

  if (filtered.length === 0) {
    return '## Analytics Tool Results\nNo rows matched for the requested filters.';
  }

  const byStatus = new Map<string, number>();
  const byCarrier = new Map<string, number>();

  for (const row of filtered) {
    const status = (row.appetite_status || 'unknown').toLowerCase();
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    const carrier = row.carrier_raw || 'Unknown';
    byCarrier.set(carrier, (byCarrier.get(carrier) || 0) + 1);
  }

  const topCarriers = Array.from(byCarrier.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let out = '## Analytics Tool Results\n';
  out += `Matched rows: ${filtered.length}\n`;
  out += `Status counts: ${Array.from(byStatus.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
  out += `Top carriers: ${topCarriers.map(([k, v]) => `${k} (${v})`).join(', ')}\n`;

  return out;
}

function buildAuditBlock(): string {
  const stats = getDataStats();
  const currentSource = isLoadedFromDatabase() ? 'database' : 'csv';

  return [
    '## Data Source Audit',
    `- databaseModePaused: ${isDatabaseModePaused()}`,
    `- activeRuntimeSource: ${currentSource}`,
    `- carrierAppetiteCsvPath: ${getCarrierAppetiteCsvPath()}`,
    `- analyticsToolSource: ${lastAiReadySource}`,
    `- rulesToolSource: ${lastRulesSource}`,
    `- dbCollections: aiReady=${DB_AI_READY_COLLECTION}, rules=${DB_RULES_COLLECTION}`,
    `- dataOutputsUsedByTools: ${AI_READY_DATA_PATH}, ${RULES_DATA_PATH}`,
    '- note: frontend cannot read 01_raw_inputs directly from filesystem; it reads files served from public/data.',
    `- inMemoryStats: carriers=${stats.totalCarriers}, records=${stats.totalRecords}, lobs=${stats.totalLobs}`,
  ].join('\n');
}

export async function routeAndExecuteTools(input: ToolRoutingInput): Promise<ToolRoutingResult> {
  await loadInsuranceData();

  const query = input.query || '';
  const state = input.state || '';
  const lob = input.lob || '';
  const limit = input.limit || 10;
  const coverageAmount = input.coverageAmount || 0;

  const intent = detectIntent(query);
  const usedTools: string[] = [];
  const blocks: string[] = [];
  let rankedCandidates: RankedCandidate[] = [];

  const carrierHint = findCarrierMention(query);
  const placementRows = searchCarriers(state, lob, limit);
  const [aiRows, ruleRows] = await Promise.all([getAiReadyRows(), getRuleRows()]);
  rankedCandidates = rankPlacementCandidates(placementRows, aiRows, ruleRows, state, lob, coverageAmount);
  const allowedCarriers = rankedCandidates.map((c) => c.carrier);

  if (intent === 'placement') {
    usedTools.push('placementTool');
    blocks.push(formatPlacementContext(rankedCandidates, state, lob));

    usedTools.push('rulesTool');
    blocks.push(await executeRulesTool(state, lob, carrierHint));
  }

  if (intent === 'rules') {
    usedTools.push('rulesTool');
    blocks.push(await executeRulesTool(state, lob, carrierHint));

    usedTools.push('placementTool');
    blocks.push(formatPlacementContext(rankedCandidates, state, lob));
  }

  if (intent === 'analytics') {
    usedTools.push('analyticsTool');
    blocks.push(await executeAnalyticsTool(state, lob));

    usedTools.push('placementTool');
    blocks.push(formatPlacementContext(rankedCandidates, state, lob));
  }

  if (intent === 'diagnostic') {
    usedTools.push('auditTool');
    blocks.push(buildAuditBlock());

    usedTools.push('analyticsTool');
    blocks.push(await executeAnalyticsTool(state, lob));
  }

  blocks.push(buildAuditBlock());

  return {
    intent,
    usedTools,
    contextBlock: blocks.join('\n\n'),
    allowedCarriers,
    rankedCandidates,
  };
}
