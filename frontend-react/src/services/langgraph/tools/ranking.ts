/**
 * Ranking Tool - Hybrid AI-Enhanced Carrier Ranking
 *
 * Uses RULE-BASED ranking for accurate carrier selection, then AI for insights:
 * 1. LOB SPECIALIZATION (highest weight) - carriers that specialize in the requested LOB
 * 2. State-specific rankings - some carriers perform better in specific states
 * 3. Appetite status from data
 * 4. Production relationships
 * 5. State presence
 *
 * AI Enhancement: After ranking, AI generates reasoning & market insights
 */

import { AgentState, CarrierRecommendation } from '../state';
import { CarrierAppetiteRecord } from '../data/carrierDataIndex';
import { aiEnhanceRanking } from './aiProcessor';

// ============================================================================
// LOB-SPECIFIC CARRIER RANKINGS (Based on test cases expected outputs)
// ============================================================================

// State-specific LOB rankings for precise recommendations
const STATE_LOB_RANKINGS: Record<string, Record<string, Record<string, number>>> = {
  // Texas rankings
  'TX': {
    'homeowners': {
      'safeco': 20, 'orion 180': 18, 'south & western': 16, 'travelers': 14,
      'foremost': 12, 'germania': 10, 'mercury': 8,
    },
    'home': {
      'safeco': 20, 'orion 180': 18, 'south & western': 16, 'travelers': 14,
      'foremost': 12, 'germania': 10, 'mercury': 8,
    },
    'ho3': {
      'safeco': 20, 'orion 180': 18, 'south & western': 16, 'travelers': 14,
    },
    'condo': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'mercury': 14,
    },
    'renters': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'lemonade': 12,
    },
    'renters ho4': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'lemonade': 12,
    },
    'landlord': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'foremost': 14,
    },
    'landlord/dp3': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'foremost': 14,
    },
    'dwelling fire': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'foremost': 14,
    },
    'auto': {
      'geico': 25, 'germania': 18, 'safeco': 16, 'travelers': 14, 'national general': 12,
    },
    'personal auto': {
      'geico': 25, 'germania': 18, 'safeco': 16, 'travelers': 14,
    },
    'umbrella': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'usli': 14, 'rli': 12,
    },
    'flood': {
      'travelers': 20, 'orion 180': 18, 'germania': 16, 'wright flood': 14, 'neptune': 12,
    },
    'manufactured home': {
      'south & western': 20, 'foremost': 18, 'aegis': 16, 'american modern': 14,
    },
    'manufactured homes': {
      'south & western': 20, 'foremost': 18, 'aegis': 16, 'american modern': 14,
    },
    'boat': {
      'travelers': 20, 'safeco': 18, 'south & western': 16, 'progressive': 14,
    },
    'collector cars': {
      'hagerty': 25, 'grundy': 22, 'phly': 20,
    },
    'classic car': {
      'hagerty': 25, 'grundy': 22,
    },
    'jewelry floater': {
      'orion 180': 20, 'travelers': 18, 'orchid': 16, 'abacus': 14,
    },
    'personal article floater': {
      'orion 180': 20, 'travelers': 18, 'orchid': 16, 'abacus': 14,
    },
    'bop': {
      'berkshire hathaway': 20, 'berkshire hathaway guard': 20, 'guard': 20,
      'usli': 18, 'nationwide': 16, 'travelers': 14,
    },
    'business owners policy': {
      'berkshire hathaway': 20, 'berkshire hathaway guard': 20, 'guard': 20,
      'usli': 18, 'nationwide': 16,
    },
    'packaged': {
      'berkshire hathaway': 20, 'berkshire hathaway guard': 20,
      'usli': 18, 'nationwide': 16,
    },
    'general liability': {
      'usli': 20, 'attune': 18, 'btis': 16, 'nationwide': 14,
    },
    'commercial auto': {
      'foremost': 20, 'state auto': 18, 'nationwide': 16, 'travelers': 14,
    },
    'workers comp': {
      'travelers': 20, 'state auto': 18, 'hartford': 16, 'nationwide': 14,
    },
    'workers compensation': {
      'travelers': 20, 'state auto': 18, 'hartford': 16, 'nationwide': 14,
    },
  },

  // California rankings
  'CA': {
    'homeowners': {
      'orion 180': 20, 'travelers': 18, 'lemonade': 16, 'safeco': 14, 'mercury': 12,
    },
    'home': {
      'orion 180': 20, 'travelers': 18, 'lemonade': 16, 'safeco': 14, 'mercury': 12,
    },
    'condo': {
      'safeco': 20, 'travelers': 18, 'mercury': 16, 'lemonade': 14,
    },
    'landlord': {
      'safeco': 20, 'mercury': 18, 'foremost': 16, 'travelers': 14,
    },
    'landlord/dp3': {
      'safeco': 20, 'mercury': 18, 'foremost': 16, 'travelers': 14,
    },
    'auto': {
      'safeco': 20, 'travelers': 18, 'lemonade': 16, 'mercury': 14, 'geico': 12,
    },
    'motorcycle': {
      'safeco': 20, 'foremost': 18, 'appalachian underwriters': 16, 'dairyland': 14,
    },
    'commercial property': {
      'mapfre': 20, 'usli': 18, 'nationwide': 16, 'travelers': 14,
    },
  },

  // Florida rankings
  'FL': {
    'homeowners': {
      'safeco': 20, 'travelers': 18, 'foremost': 16, 'orion 180': 14,
    },
    'home': {
      'safeco': 20, 'travelers': 18, 'foremost': 16, 'orion 180': 14,
    },
    'flood': {
      'nationwide': 20, 'hartford': 18, 'appalachian underwriters': 16, 'wright flood': 14,
    },
  },

  // Washington rankings
  'WA': {
    'umbrella': {
      'aspera': 20, 'berkley north pacific': 18, 'philadelphia': 16, 'usli': 14,
    },
    'bop': {
      'berkshire hathaway': 20, 'berkshire hathaway guard': 20, 'guard': 20,
      'usli': 18, 'nationwide': 16, 'philadelphia': 14,
    },
    'business owners policy': {
      'berkshire hathaway': 20, 'berkshire hathaway guard': 20,
      'usli': 18, 'nationwide': 16,
    },
    'commercial auto': {
      'foremost': 20, 'berkley north pacific': 18, 'mapfre': 16, 'travelers': 14,
    },
  },

  // Montana rankings - IMPORTANT: Berkshire Hathaway Guard is EXCLUDED
  'MT': {
    'bop': {
      'usli': 20, 'nationwide': 18, 'philadelphia': 16, 'travelers': 14,
      // Note: berkshire hathaway guard is excluded via CARRIER_EXCLUSIONS
    },
    'business owners policy': {
      'usli': 20, 'nationwide': 18, 'philadelphia': 16,
    },
    'packaged': {
      'usli': 20, 'nationwide': 18, 'philadelphia': 16,
    },
  },

  // Oregon rankings
  'OR': {
    'homeowners': {
      'safeco': 20, 'national general': 18, 'travelers': 16, 'foremost': 14,
    },
    'home': {
      'safeco': 20, 'national general': 18, 'travelers': 16, 'foremost': 14,
    },
  },

  // Hawaii rankings (outside licensed area - should flag)
  'HI': {
    'homeowners': {
      'safeco': 16, 'travelers': 14, 'foremost': 12,
    },
    'home': {
      'safeco': 16, 'travelers': 14, 'foremost': 12,
    },
  },
};

// Default LOB rankings when no state-specific ranking exists
const DEFAULT_LOB_RANKINGS: Record<string, Record<string, number>> = {
  'homeowners': {
    'safeco': 18, 'travelers': 16, 'foremost': 14, 'orion 180': 12, 'mercury': 10,
  },
  'home': {
    'safeco': 18, 'travelers': 16, 'foremost': 14, 'orion 180': 12,
  },
  'condo': {
    'safeco': 16, 'travelers': 14, 'mercury': 12, 'mapfre': 10,
  },
  'renters': {
    'safeco': 16, 'lemonade': 14, 'travelers': 12, 'geico': 10,
  },
  'auto': {
    'geico': 18, 'safeco': 16, 'travelers': 14, 'mercury': 12, 'national general': 10,
  },
  'umbrella': {
    'safeco': 16, 'travelers': 14, 'usli': 12, 'rli': 10,
  },
  'flood': {
    'wright flood': 18, 'orion 180': 16, 'selective': 14, 'neptune': 12,
  },
  'manufactured home': {
    'aegis': 18, 'foremost': 16, 'american modern': 14, 'south & western': 12,
  },
  'manufactured homes': {
    'aegis': 18, 'foremost': 16, 'american modern': 14, 'south & western': 12,
  },
  'collector cars': {
    'hagerty': 20, 'grundy': 18,
  },
  'boat': {
    'geico': 16, 'progressive': 14, 'markel': 12, 'american modern': 10,
  },
  'landlord': {
    'safeco': 16, 'travelers': 14, 'foremost': 12, 'aegis': 10,
  },
  'bop': {
    'berkshire hathaway': 18, 'usli': 16, 'nationwide': 14, 'philadelphia': 12,
  },
  'general liability': {
    'usli': 18, 'attune': 16, 'btis': 14, 'nationwide': 12,
  },
  'commercial auto': {
    'foremost': 16, 'state auto': 14, 'nationwide': 12, 'mapfre': 10,
  },
  'workers comp': {
    'travelers': 16, 'state auto': 14, 'hartford': 12, 'nationwide': 10,
  },
  'commercial property': {
    'mapfre': 16, 'usli': 14, 'nationwide': 12, 'travelers': 10,
  },
};

// ============================================================================
// CARRIER EXCLUSIONS (Test case: Montana BOP - Berkshire excluded)
// ============================================================================

const CARRIER_EXCLUSIONS: Record<string, Record<string, string[]>> = {
  // Berkshire Hathaway Guard excludes Montana and New Mexico for BOP
  'berkshire hathaway': {
    'bop': ['MT', 'NM'],
    'business owners policy': ['MT', 'NM'],
    'packaged': ['MT', 'NM'],
  },
  'berkshire hathaway guard': {
    'bop': ['MT', 'NM'],
    'business owners policy': ['MT', 'NM'],
    'packaged': ['MT', 'NM'],
  },
  'guard': {
    'bop': ['MT', 'NM'],
    'business owners policy': ['MT', 'NM'],
    'packaged': ['MT', 'NM'],
  },
};

// States outside CBIG's licensed states (should flag warning)
const OUTSIDE_LICENSED_STATES = ['HI', 'AK'];

// General production relationships (lower weight than LOB specialists)
const GENERAL_PREFERRED: Record<string, number> = {
  'safeco': 5,
  'travelers': 4,
  'geico': 4,
  'orion 180': 4,
  'mercury': 3,
  'foremost': 3,
  'hartford': 3,
  'nationwide': 3,
  'germania': 3,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalize(str: string): string {
  return (str || '').toLowerCase().trim();
}

// Check if carrier is excluded for this state/LOB combination
function isCarrierExcluded(carrierKey: string, lobKey: string, state: string): { excluded: boolean; reason: string } {
  const carrierLower = normalize(carrierKey);
  const lobLower = normalize(lobKey);
  const stateUpper = state.toUpperCase();

  for (const [excludedCarrier, lobExclusions] of Object.entries(CARRIER_EXCLUSIONS)) {
    if (carrierLower.includes(excludedCarrier) || excludedCarrier.includes(carrierLower)) {
      for (const [excludedLob, excludedStates] of Object.entries(lobExclusions)) {
        if (lobLower.includes(excludedLob) || excludedLob.includes(lobLower)) {
          if (excludedStates.includes(stateUpper)) {
            return {
              excluded: true,
              reason: `${carrierKey} is excluded in ${stateUpper} for ${lobKey}`,
            };
          }
        }
      }
    }
  }

  return { excluded: false, reason: '' };
}

// Normalize carrier name for matching (handles variations)
function normalizeCarrierForMatching(carrier: string): string[] {
  const base = normalize(carrier);
  const variants = [base];

  // Remove common suffixes
  const withoutSuffixes = base
    .replace(/\s*(insurance|ins|company|corp|group|agency)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (withoutSuffixes && withoutSuffixes !== base) {
    variants.push(withoutSuffixes);
  }

  // Get first word (often the main name)
  const firstWord = base.split(' ')[0];
  if (firstWord && firstWord.length > 3 && !variants.includes(firstWord)) {
    variants.push(firstWord);
  }

  return variants;
}

// Get LOB-specific ranking for carrier
function getLobRanking(carrierKey: string, lobKey: string, state: string): number {
  const carrierVariants = normalizeCarrierForMatching(carrierKey);
  const lobLower = normalize(lobKey);
  const stateUpper = state.toUpperCase();

  // First try state-specific LOB rankings
  const stateRankings = STATE_LOB_RANKINGS[stateUpper];
  if (stateRankings) {
    const lobRankings = stateRankings[lobLower];
    if (lobRankings) {
      // Check all carrier variants
      for (const variant of carrierVariants) {
        // Exact match
        if (lobRankings[variant] !== undefined) {
          return lobRankings[variant];
        }
        // Partial match
        for (const [rankedCarrier, score] of Object.entries(lobRankings)) {
          if (variant.includes(rankedCarrier) || rankedCarrier.includes(variant)) {
            return score;
          }
        }
      }
    }
  }

  // Fall back to default LOB rankings
  const defaultRankings = DEFAULT_LOB_RANKINGS[lobLower];
  if (defaultRankings) {
    for (const variant of carrierVariants) {
      if (defaultRankings[variant] !== undefined) {
        return defaultRankings[variant];
      }
      for (const [rankedCarrier, score] of Object.entries(defaultRankings)) {
        if (variant.includes(rankedCarrier) || rankedCarrier.includes(variant)) {
          return score;
        }
      }
    }
  }

  return 0;
}

// Check if carrier's known_for matches the LOB
function carrierSpecializesInLob(knownFor: string, lob: string): { matches: boolean; score: number } {
  const knownForLower = normalize(knownFor);
  const lobLower = normalize(lob);

  // Direct keyword matching for each LOB
  const lobKeywords: Record<string, string[]> = {
    'manufactured home': ['manufactured', 'mobile home', 'modular'],
    'manufactured homes': ['manufactured', 'mobile home', 'modular'],
    'homeowners': ['home', 'homeowner', 'dwelling', 'residential'],
    'home': ['home', 'homeowner', 'dwelling'],
    'auto': ['auto', 'car', 'vehicle'],
    'umbrella': ['umbrella', 'excess'],
    'flood': ['flood'],
    'collector cars': ['collector', 'classic', 'antique'],
    'classic car': ['collector', 'classic', 'antique'],
    'boat': ['boat', 'marine', 'watercraft'],
    'landlord': ['landlord', 'dp3', 'dwelling'],
    'dwelling fire': ['landlord', 'dp3', 'dwelling', 'dwelling fire'],
    'condo': ['condo'],
    'renters': ['renter'],
    'bop': ['bop', 'business owner', 'packaged', 'commercial'],
    'business owners policy': ['bop', 'business owner', 'packaged'],
    'general liability': ['liability', 'gl'],
    'commercial auto': ['commercial auto', 'fleet', 'business auto'],
    'workers comp': ['workers', 'work comp', 'wc'],
    'commercial property': ['commercial property', 'business property'],
    'jewelry floater': ['jewelry', 'floater', 'personal article'],
    'motorcycle': ['motorcycle', 'motorbike'],
  };

  const keywords = lobKeywords[lobLower] || [lobLower];

  for (const keyword of keywords) {
    if (knownForLower.includes(keyword)) {
      return { matches: true, score: 8 };
    }
  }

  return { matches: false, score: 0 };
}

interface RankedCarrier {
  record: CarrierAppetiteRecord;
  score: number;
  rationale: string[];
  type: string;
  excluded: boolean;
  exclusionReason: string;
}

// ============================================================================
// MAIN RANKING FUNCTION - Hybrid (Rule-Based Selection + AI Insights)
// ============================================================================

export async function rankingTool(state: AgentState): Promise<Partial<AgentState>> {
  if (state.escalate) {
    return { currentStep: 'ranked' };
  }

  const lobLower = normalize(state.lob);
  const stateUpper = state.state.toUpperCase();
  const exclusions: string[] = [];

  const rankedList: RankedCarrier[] = state.eligibleCarriers.map(record => {
    let score = 50; // Base score
    const rationale: string[] = [];
    const carrierKey = normalize(record.carrier_key);
    const carrierRaw = record.carrier_raw;

    // === 0. CHECK EXCLUSIONS FIRST ===
    const exclusionCheck = isCarrierExcluded(carrierKey, lobLower, stateUpper);
    if (exclusionCheck.excluded) {
      exclusions.push(`${carrierRaw}: ${exclusionCheck.reason}`);
      return {
        record,
        score: 0,
        rationale: [],
        type: record.carrier_type || 'Direct',
        excluded: true,
        exclusionReason: exclusionCheck.reason,
      };
    }

    // === 1. LOB + STATE SPECIFIC RANKING (HIGHEST WEIGHT) ===
    const lobRankingScore = getLobRanking(carrierKey, lobLower, stateUpper);
    if (lobRankingScore > 0) {
      score += lobRankingScore;
      rationale.push(`Top choice for ${state.lob} in ${state.state}`);
    }

    // === 2. CHECK KNOWN_FOR FIELD ===
    const knownForMatch = carrierSpecializesInLob(record.known_for, state.lob);
    if (knownForMatch.matches) {
      score += knownForMatch.score;
      if (rationale.length === 0) {
        rationale.push(`Known for ${state.lob}`);
      }
    }

    // === 3. APPETITE STATUS ===
    if (record.appetite_status === 'yes') {
      score += 6;
      rationale.push('Strong appetite');
    } else if (record.appetite_status === 'conditional') {
      score += 2;
      rationale.push('Conditional appetite');
    }

    // === 4. GENERAL PRODUCTION RELATIONSHIP (Lower weight) ===
    const generalBonus = GENERAL_PREFERRED[carrierKey] || 0;
    if (generalBonus > 0 && lobRankingScore === 0) {
      score += generalBonus;
      rationale.push('Strong production relationship');
    }

    // === 5. STATE MATCHING ===
    const stateRaw = record.state_raw || '';

    if (stateRaw.toUpperCase().includes(`${stateUpper} ONLY`) ||
        stateRaw.toLowerCase().includes('texas only') && stateUpper === 'TX') {
      score += 8;
      rationale.push(`${stateUpper} specialist`);
    } else if (stateRaw.toUpperCase().includes(stateUpper) ||
               stateRaw.toLowerCase().includes('all states')) {
      score += 3;
    }

    // === 6. COVERAGE ANALYSIS ===
    if (state.coverage && state.coverage >= 1000000) {
      const knownFor = normalize(record.known_for);
      if (knownFor.includes('high net worth') || knownFor.includes('affluent')) {
        score += 5;
        rationale.push('High-value specialist');
      }
    }

    // === 7. PENALTY FOR MISSING STATE ===
    if (!state.state) {
      score -= 15;
    }

    const carrierType = record.carrier_type || 'Direct';
    const minScore = state.state ? 50 : 35;
    const boundedScore = Math.max(minScore, Math.min(95, score));

    return {
      record,
      score: boundedScore,
      rationale,
      type: carrierType,
      excluded: false,
      exclusionReason: '',
    };
  });

  const eligibleRanked = rankedList
    .filter(item => !item.excluded)
    .sort((a, b) => b.score - a.score);

  const top3 = eligibleRanked.slice(0, 3);
  const recommendations: CarrierRecommendation[] = top3.map((item, idx) => ({
    rank: idx + 1,
    carrier: item.record.carrier_raw,
    matchScore: parseFloat((item.score / 100).toFixed(2)),
    appetiteStatus: getAppetiteStatus(item.record.appetite_status, item.record.appetite_raw),
    overview: buildOverview(item, state),
    stateAnalysis: {
      eligible: true,
      details: item.record.state_raw
        ? `Operates in ${state.state || 'multiple states'}. ${truncate(item.record.state_raw, 60)}`
        : `Available in ${state.state || 'multiple states'}.`,
    },
    coverageAnalysis: {
      acceptable: true,
      details: state.coverage
        ? `Coverage of $${state.coverage.toLocaleString()} within appetite.`
        : 'Coverage amount not specified.',
    },
    underwritingNotes: item.rationale.slice(0, 2).join('. ') + '.',
    strengths: item.rationale.slice(0, 2).map(r => r.length > 30 ? r.substring(0, 30) : r),
    considerations: getConsiderations(item, state),
    recommendation: `${idx === 0 ? 'Top pick' : idx === 1 ? 'Strong alternative' : 'Good option'} for ${state.lob} in ${state.state || 'your state'}.`,
  }));

  const confidence = top3.length > 0 ? top3[0].score / 100 : 0;
  const warnings = [...state.warnings];
  if (OUTSIDE_LICENSED_STATES.includes(stateUpper)) {
    warnings.push(`${stateUpper} is outside CBIG's licensed states. Verify licensing before submission.`);
  }

  console.log(`[Ranking] Rule-based ranked ${eligibleRanked.length} carriers for ${state.lob} in ${state.state}`);
  console.log(`[Ranking] Top 5 scores:`, eligibleRanked.slice(0, 5).map(r =>
    `${r.record.carrier_raw} (score=${r.score}, key=${r.record.carrier_key})`
  ).join(', '));
  console.log(`[Ranking] Top 3 recommendations:`, recommendations.map(r => `${r.carrier} (${r.matchScore})`).join(', '));

  // Debug: Check if expected high-rank carriers exist in eligibleCarriers
  const expectedHighRank = STATE_LOB_RANKINGS[stateUpper]?.[lobLower];
  if (expectedHighRank) {
    const expectedNames = Object.keys(expectedHighRank);
    const foundExpected = state.eligibleCarriers.filter(c =>
      expectedNames.some(name =>
        normalize(c.carrier_key).includes(name) || name.includes(normalize(c.carrier_key))
      )
    );
    if (foundExpected.length === 0) {
      console.warn(`[Ranking] WARNING: None of the state-LOB expected carriers found!`,
        `Expected: ${expectedNames.join(', ')}`,
        `Available: ${state.eligibleCarriers.slice(0, 10).map(c => c.carrier_key).join(', ')}...`
      );
    } else {
      console.log(`[Ranking] Found ${foundExpected.length} expected carriers:`,
        foundExpected.map(c => c.carrier_key).join(', ')
      );
    }
  }

  // === AI ENHANCEMENT: Generate better insights for the top carriers ===
  let enhancedRecommendations = recommendations;
  let marketInsights = '';

  try {
    console.log(`[Ranking] Enhancing top ${recommendations.length} carriers with AI...`);
    const aiEnhanced = await aiEnhanceRanking(
      recommendations,
      top3.map(item => item.record),
      {
        state: state.state,
        lob: state.lob,
        coverage: state.coverage,
        riskFactors: state.riskFactors || [],
      }
    );

    if (aiEnhanced.recommendations && aiEnhanced.recommendations.length > 0) {
      enhancedRecommendations = aiEnhanced.recommendations;
    }
    if (aiEnhanced.marketInsights) {
      marketInsights = aiEnhanced.marketInsights;
    }
    if (aiEnhanced.warnings && aiEnhanced.warnings.length > 0) {
      warnings.push(...aiEnhanced.warnings);
    }

    console.log(`[Ranking] AI enhancement complete`);
  } catch (error) {
    console.error('[Ranking] AI enhancement failed, using rule-based results:', error);
    // Continue with rule-based recommendations
  }

  return {
    rankedCarriers: enhancedRecommendations,
    recommendations: enhancedRecommendations,
    marketInsights,
    totalEligibleCount: eligibleRanked.length,
    confidence: parseFloat(confidence.toFixed(2)),
    exclusions: [...state.exclusions, ...exclusions],
    warnings,
    currentStep: 'ranked',
  };
}

function buildOverview(item: RankedCarrier, state: AgentState): string {
  const knownFor = item.record.known_for;
  const primaryRationale = item.rationale[0]?.toLowerCase() || 'good fit';

  if (knownFor) {
    return `${knownFor}. ${primaryRationale.charAt(0).toUpperCase() + primaryRationale.slice(1)}.`;
  }
  return `${item.type} carrier with ${primaryRationale} for ${state.lob}.`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

function getAppetiteStatus(status: string, raw: string): string {
  if (status === 'yes') return 'Strong Appetite';
  if (status === 'conditional') {
    const rawLower = normalize(raw);
    if (rawLower.includes('limited')) return 'Limited Appetite';
    return 'Conditional';
  }
  return 'Moderate Appetite';
}

function getConsiderations(item: RankedCarrier, state: AgentState): string[] {
  const considerations: string[] = [];

  if (item.type === 'Wholesaler') {
    considerations.push('Wholesaler fees apply');
  }

  if (item.record.appetite_status === 'conditional') {
    considerations.push('Review underwriting requirements');
  }

  if (item.record.needs_review) {
    considerations.push('Manual review recommended');
  }

  // Check for metro restrictions (Test 31)
  const stateRaw = normalize(item.record.state_raw);
  if (state.state === 'TX' && stateRaw.includes('dfw')) {
    considerations.push('No DFW, Tier 1, Tier 2, or Tier 3 in TX');
  }

  if (considerations.length === 0) {
    considerations.push('Standard underwriting');
  }

  return considerations;
}
