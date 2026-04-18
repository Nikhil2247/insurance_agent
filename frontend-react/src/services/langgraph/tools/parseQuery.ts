/**
 * Parse Query Tool
 * Extracts state, LOB, coverage from user query and normalizes for efficient data lookup
 */

import { AgentState } from '../state';
import { normalizeLobQuery } from '../data/carrierDataIndex';

// State name mappings
const STATE_MAPPINGS: Record<string, string> = {
  'texas': 'TX', 'california': 'CA', 'florida': 'FL', 'washington': 'WA',
  'oregon': 'OR', 'arizona': 'AZ', 'nevada': 'NV', 'colorado': 'CO',
  'montana': 'MT', 'idaho': 'ID', 'utah': 'UT', 'new mexico': 'NM',
  'oklahoma': 'OK', 'arkansas': 'AR', 'tennessee': 'TN', 'georgia': 'GA',
  'north carolina': 'NC', 'south carolina': 'SC', 'alabama': 'AL',
  'mississippi': 'MS', 'louisiana': 'LA', 'hawaii': 'HI', 'ohio': 'OH',
  'indiana': 'IN', 'illinois': 'IL', 'michigan': 'MI', 'wisconsin': 'WI',
  'minnesota': 'MN', 'iowa': 'IA', 'missouri': 'MO', 'kansas': 'KS',
  'nebraska': 'NE', 'south dakota': 'SD', 'north dakota': 'ND',
  'wyoming': 'WY', 'kentucky': 'KY', 'west virginia': 'WV', 'virginia': 'VA',
  'maryland': 'MD', 'delaware': 'DE', 'new jersey': 'NJ', 'pennsylvania': 'PA',
  'new york': 'NY', 'connecticut': 'CT', 'rhode island': 'RI',
  'massachusetts': 'MA', 'vermont': 'VT', 'new hampshire': 'NH', 'maine': 'ME',
};

// LOB mappings (more specific first) -> display name
const LOB_MAPPINGS: Array<{ keywords: string[]; lob: string }> = [
  // Home/Dwelling
  { keywords: ['dwelling fire', 'tenant-occupied', 'tenant occupied'], lob: 'Landlord' },
  { keywords: ['homeowners', 'homeowner', 'home insurance', 'owner-occupied', 'home policy'], lob: 'Homeowners' },
  { keywords: ['landlord', 'dp3', 'dp-3', 'rental property', 'investment property'], lob: 'Landlord' },
  { keywords: ['condo', 'condominium', 'ho6', 'ho-6'], lob: 'Condo' },
  { keywords: ['renters', 'renter', 'ho4', 'ho-4'], lob: 'Renters' },
  { keywords: ['manufactured home', 'mobile home', 'modular home'], lob: 'Manufactured Home' },
  { keywords: ['high net worth', 'hnw', 'affluent'], lob: 'High Net Worth' },

  // Auto
  { keywords: ['personal auto', 'auto insurance', 'car insurance'], lob: 'Auto' },
  { keywords: ['commercial auto', 'business auto', 'fleet'], lob: 'Commercial Auto' },
  { keywords: ['classic car', 'collector car', 'antique car'], lob: 'Collector Cars' },
  { keywords: ['motorcycle', 'motorbike'], lob: 'Motorcycle' },

  // Commercial
  { keywords: ['bop', 'business owners policy', 'business owners', 'packaged'], lob: 'BOP' },
  { keywords: ['general liability', 'gl', 'liability insurance'], lob: 'General Liability' },
  { keywords: ['workers comp', 'workers compensation', 'work comp'], lob: 'Workers Compensation' },
  { keywords: ['commercial property', 'business property'], lob: 'Commercial Property' },

  // Umbrella/Specialty
  { keywords: ['umbrella', 'excess liability', 'personal umbrella'], lob: 'Umbrella' },
  { keywords: ['flood', 'flood insurance'], lob: 'Flood' },
  { keywords: ['earthquake'], lob: 'Earthquake' },
  { keywords: ['boat', 'watercraft'], lob: 'Boat' },
  { keywords: ['yacht'], lob: 'Yachts' },
  { keywords: ['jewelry', 'jewelry floater', 'personal article'], lob: 'Jewelry Floater' },
  { keywords: ['rv', 'recreational vehicle', 'motorhome'], lob: 'RV' },

  // Fallback
  { keywords: ['home'], lob: 'Homeowners' },
  { keywords: ['auto'], lob: 'Auto' },
];

// Follow-up detection patterns - extract carrier name
const FOLLOWUP_PATTERNS = [
  /(?:proceed with|select|choose|go with|i'd like)\s+([^(]+?)(?:\s*\(|$)/i,
  /more (?:details|info|about)\s+(.+?)(?:\s*\(|$)/i,
  /tell me (?:more )?about\s+(.+?)(?:\s*\(|$)/i,
];

// Common words that are NOT state abbreviations even though they match
// Used to avoid false positives when parsing state from text
const _NOT_STATE_ABBREVS = ['in', 'or', 'me', 'hi', 'ok', 'oh', 'la', 'ma', 'md', 'pa', 'va', 'wa'];
void _NOT_STATE_ABBREVS; // Suppress unused warning - reserved for future use

export function parseQueryTool(state: AgentState): Partial<AgentState> {
  const query = state.userQuery;
  const queryLower = query.toLowerCase();
  let parsedState = '';
  let parsedLob = '';
  let parsedCoverage = 0;
  let queryIntent: 'search' | 'followup' | 'general' = 'search';
  let selectedCarrier = '';
  const warnings: string[] = [];

  // === Detect Query Intent - Check for follow-up FIRST ===
  for (const pattern of FOLLOWUP_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      queryIntent = 'followup';
      selectedCarrier = match[1].trim();
      console.log(`[ParseQuery] Detected FOLLOW-UP for carrier: ${selectedCarrier}`);

      // For follow-ups, we don't need to parse state/LOB/coverage
      return {
        state: '',
        lob: '',
        lobKeys: [],
        coverage: 0,
        queryIntent,
        warnings: [],
        currentStep: 'parsed',
        // Store selected carrier in messages for later use
        messages: [...state.messages, { role: 'system', content: `SELECTED_CARRIER:${selectedCarrier}` }],
      };
    }
  }

  // === Parse State (only for search queries) ===
  // IMPORTANT: Look for UPPERCASE state abbreviations ONLY to avoid matching "in", "or" etc.
  // Match patterns like "in TX", "for CA", "in California" etc.

  // First try: Look for uppercase 2-letter codes (most reliable)
  const upperStateMatch = query.match(/\b([A-Z]{2})\b/);
  if (upperStateMatch) {
    const candidate = upperStateMatch[1];
    // Verify it's a valid state abbreviation
    const validStates = Object.values(STATE_MAPPINGS);
    if (validStates.includes(candidate)) {
      parsedState = candidate;
    }
  }

  // Second try: Look for "in [STATE]" pattern with case-insensitive state
  if (!parsedState) {
    const inStateMatch = query.match(/\bin\s+([A-Z]{2})\b/i);
    if (inStateMatch) {
      const candidate = inStateMatch[1].toUpperCase();
      const validStates = Object.values(STATE_MAPPINGS);
      // Don't match "in" itself as a state
      if (validStates.includes(candidate) && candidate !== 'IN') {
        parsedState = candidate;
      }
    }
  }

  // Third try: Look for full state names
  if (!parsedState) {
    for (const [fullName, abbrev] of Object.entries(STATE_MAPPINGS)) {
      if (queryLower.includes(fullName)) {
        parsedState = abbrev;
        break;
      }
    }
  }

  if (!parsedState) {
    warnings.push('State not specified - please confirm state before placement');
  }

  // === Parse LOB ===
  for (const mapping of LOB_MAPPINGS) {
    const found = mapping.keywords.some(kw => queryLower.includes(kw));
    if (found) {
      parsedLob = mapping.lob;
      break;
    }
  }

  if (!parsedLob) {
    warnings.push('Line of business not clearly identified');
  }

  // === Normalize LOB for efficient data lookup ===
  const lobKeys = parsedLob ? normalizeLobQuery(parsedLob) : [];

  // === Parse Coverage Amount ===
  // Be more specific - look for $ followed by numbers, or numbers followed by "coverage"/"limit"
  const coveragePatterns = [
    /\$\s*([\d,]+)/,                                    // $400,000
    /([\d,]+)\s*(?:coverage|limit|dwelling)/i,          // 400000 coverage
    /\$?\s*([\d.]+)\s*(?:million|mil|m)\b/i,            // $1.5 million
    /\$?\s*([\d.]+)\s*k\b/i,                            // $400k
  ];

  for (const pattern of coveragePatterns) {
    const match = query.match(pattern);
    if (match) {
      let value = match[1].replace(/,/g, '');
      if (pattern.source.includes('million') || pattern.source.includes('mil')) {
        parsedCoverage = parseFloat(value) * 1000000;
      } else if (pattern.source.includes('k\\b')) {
        parsedCoverage = parseFloat(value) * 1000;
      } else {
        const numValue = parseInt(value);
        // Only accept reasonable coverage amounts (> $10,000)
        if (numValue >= 10000) {
          parsedCoverage = numValue;
        }
      }
      if (parsedCoverage > 0) break;
    }
  }

  if (!parsedCoverage) {
    warnings.push('Coverage amount not provided - some coverage-limit rules were not applied');
  }

  console.log(`[ParseQuery] State: ${parsedState}, LOB: ${parsedLob}, Coverage: ${parsedCoverage}, Intent: ${queryIntent}`);

  return {
    state: parsedState,
    lob: parsedLob,
    lobKeys,
    coverage: parsedCoverage,
    queryIntent,
    warnings: [...state.warnings, ...warnings],
    currentStep: 'parsed',
  };
}
