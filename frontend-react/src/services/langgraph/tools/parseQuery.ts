/**
 * Parse Query Tool - AI-Enhanced
 * Uses AI to understand user queries with semantic understanding
 * Falls back to regex patterns when AI is unavailable
 */

import { AgentState } from '../state';
import { normalizeLobQuery } from '../data/carrierDataIndex';
import { aiParseQuery, ParsedQuery } from './aiProcessor';

// State name mappings (used for fallback validation)
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

/**
 * AI-Enhanced Parse Query Tool
 * Uses AI to understand complex queries, falls back to regex for simple ones
 * HYBRID: Uses AI first, then validates with regex fallback for any missing fields
 */
export async function parseQueryTool(state: AgentState): Promise<Partial<AgentState>> {
  const query = state.userQuery;
  const warnings: string[] = [];

  console.log(`[ParseQuery] AI-enhanced parsing for: "${query}"`);

  // Get both AI and fallback parsed results
  let aiParsed: ParsedQuery;
  const regexParsed = fallbackParse(query); // Always run regex as backup

  try {
    aiParsed = await aiParseQuery(query);
    console.log('[ParseQuery] AI parsed result:', aiParsed);
  } catch (error) {
    console.error('[ParseQuery] AI parsing failed, using fallback:', error);
    aiParsed = regexParsed;
  }

  // HYBRID VALIDATION: Use regex fallback for any fields AI missed
  // This ensures we never miss state/LOB that regex can detect
  if (!aiParsed.state && regexParsed.state) {
    console.log(`[ParseQuery] AI missed state, using regex fallback: ${regexParsed.state}`);
    aiParsed.state = regexParsed.state;
  }
  if (!aiParsed.lob && regexParsed.lob) {
    console.log(`[ParseQuery] AI missed LOB, using regex fallback: ${regexParsed.lob}`);
    aiParsed.lob = regexParsed.lob;
    aiParsed.lobVariants = regexParsed.lobVariants;
  }
  if (!aiParsed.coverage && regexParsed.coverage) {
    console.log(`[ParseQuery] AI missed coverage, using regex fallback: ${regexParsed.coverage}`);
    aiParsed.coverage = regexParsed.coverage;
  }
  if (aiParsed.intent === 'followup' && !aiParsed.selectedCarrier && regexParsed.selectedCarrier) {
    console.log(`[ParseQuery] AI missed selected carrier, using regex fallback: ${regexParsed.selectedCarrier}`);
    aiParsed.selectedCarrier = regexParsed.selectedCarrier;
  }

  // Handle follow-up queries
  if (aiParsed.intent === 'followup' && aiParsed.selectedCarrier) {
    console.log(`[ParseQuery] Detected FOLLOW-UP for carrier: ${aiParsed.selectedCarrier}`);
    return {
      state: '',
      lob: '',
      lobKeys: [],
      coverage: 0,
      queryIntent: 'followup',
      warnings: [],
      currentStep: 'parsed',
      messages: [...state.messages, { role: 'system', content: `SELECTED_CARRIER:${aiParsed.selectedCarrier}` }],
    };
  }

  // Validate and add warnings
  if (!aiParsed.state) {
    warnings.push('State not specified - please confirm state before placement');
  }
  if (!aiParsed.lob) {
    warnings.push('Line of business not clearly identified');
  }
  if (!aiParsed.coverage) {
    warnings.push('Coverage amount not provided - some coverage-limit rules were not applied');
  }

  // Normalize LOB for data lookup - include AI-suggested variants
  let lobKeys = aiParsed.lob ? normalizeLobQuery(aiParsed.lob) : [];

  // Add AI-suggested LOB variants for broader matching
  if (aiParsed.lobVariants && aiParsed.lobVariants.length > 0) {
    const additionalKeys = aiParsed.lobVariants
      .map(v => v.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(k => !lobKeys.includes(k));
    lobKeys = [...lobKeys, ...additionalKeys];
  }

  console.log(`[ParseQuery] Final: State=${aiParsed.state}, LOB=${aiParsed.lob}, Coverage=${aiParsed.coverage}, Intent=${aiParsed.intent}`);
  console.log(`[ParseQuery] LOB Keys: ${lobKeys.join(', ')}`);
  console.log(`[ParseQuery] Risk Factors: ${aiParsed.riskFactors.join(', ') || 'none'}`);

  return {
    state: aiParsed.state,
    lob: aiParsed.lob,
    lobKeys,
    coverage: aiParsed.coverage,
    queryIntent: aiParsed.intent,
    riskFactors: aiParsed.riskFactors,
    warnings: [...state.warnings, ...warnings],
    currentStep: 'parsed',
  };
}

/**
 * Fallback regex-based parsing when AI is unavailable
 */
function fallbackParse(query: string): ParsedQuery {
  const queryLower = query.toLowerCase();
  let parsedState = '';
  let parsedLob = '';
  let parsedCoverage = 0;
  let queryIntent: 'search' | 'followup' | 'general' = 'search';
  let selectedCarrier: string | undefined;
  const lobVariants: string[] = [];

  // Check for follow-up patterns first
  for (const pattern of FOLLOWUP_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      queryIntent = 'followup';
      selectedCarrier = match[1].trim();
      return {
        state: '',
        lob: '',
        lobVariants: [],
        coverage: 0,
        intent: queryIntent,
        riskFactors: [],
        selectedCarrier,
        confidence: 0.7,
      };
    }
  }

  // Parse state
  const upperStateMatch = query.match(/\b([A-Z]{2})\b/);
  if (upperStateMatch) {
    const candidate = upperStateMatch[1];
    const validStates = Object.values(STATE_MAPPINGS);
    if (validStates.includes(candidate)) {
      parsedState = candidate;
    }
  }

  if (!parsedState) {
    for (const [fullName, abbrev] of Object.entries(STATE_MAPPINGS)) {
      if (queryLower.includes(fullName)) {
        parsedState = abbrev;
        break;
      }
    }
  }

  // Parse LOB
  for (const mapping of LOB_MAPPINGS) {
    const found = mapping.keywords.some(kw => queryLower.includes(kw));
    if (found) {
      parsedLob = mapping.lob;
      lobVariants.push(...mapping.keywords);
      break;
    }
  }

  // Parse coverage
  const coveragePatterns = [
    /\$\s*([\d,]+)/,
    /([\d,]+)\s*(?:coverage|limit|dwelling)/i,
    /\$?\s*([\d.]+)\s*(?:million|mil|m)\b/i,
    /\$?\s*([\d.]+)\s*k\b/i,
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
        if (numValue >= 10000) {
          parsedCoverage = numValue;
        }
      }
      if (parsedCoverage > 0) break;
    }
  }

  return {
    state: parsedState,
    lob: parsedLob,
    lobVariants,
    coverage: parsedCoverage,
    intent: queryIntent,
    riskFactors: [],
    selectedCarrier,
    confidence: 0.6,
  };
}
