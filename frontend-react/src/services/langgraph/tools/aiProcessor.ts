/**
 * AI Processor - Uses LLM to generate intelligent responses from carrier data
 */

import { AGENCY_CONTACT, CarrierAppetiteRecord } from '../data/carrierDataIndex';
import { CarrierRecommendation } from '../state';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const LLM_MODEL = import.meta.env.VITE_LLM_MODEL || 'google/gemini-2.0-flash-001';

interface CarrierData {
  carrier: string;
  matchScore: number;
  appetiteStatus: string;
  knownFor: string;
  states: string;
  strengths: string[];
  considerations: string[];
}

interface SearchContext {
  state: string;
  lob: string;
  coverage: number;
  carriers: CarrierData[];
  totalEligible: number;
}

/**
 * Generate market insights using AI
 */
export async function generateAIMarketInsights(context: SearchContext): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    // Fallback to template-based response if no API key
    return generateTemplateInsights(context);
  }

  const prompt = `You are an insurance placement expert. Generate a brief (2-3 sentence) market insight for this search:

State: ${context.state}
Line of Business: ${context.lob}
Coverage Amount: $${context.coverage?.toLocaleString() || 'Not specified'}
Total Eligible Carriers: ${context.totalEligible}
Top Carriers: ${context.carriers.map(c => `${c.carrier} (${c.knownFor})`).join(', ')}

Provide a professional market assessment mentioning:
- Market conditions for this LOB in this state
- Whether it's a competitive or tight market
- Any notable considerations

Keep it concise and professional. Use **bold** for emphasis.`;

  try {
    const response = await callLLM(prompt);
    return response;
  } catch (error) {
    console.error('[AIProcessor] Error generating insights:', error);
    return generateTemplateInsights(context);
  }
}

/**
 * Generate detailed carrier explanation using AI
 */
export async function generateAICarrierDetails(
  carrierName: string,
  carrierData: {
    knownFor?: string;
    states?: string;
    appetite?: string;
    lob?: string;
  } | null,
  originalContext?: { state?: string; lob?: string; coverage?: number }
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    // Fallback to template-based response
    return generateTemplateCarrierDetails(carrierName, carrierData);
  }

  const prompt = `You are an insurance placement expert. Generate a detailed placement summary for this carrier selection:

Selected Carrier: ${carrierName}
${carrierData?.knownFor ? `Known For: ${carrierData.knownFor}` : ''}
${carrierData?.states ? `Operating States: ${carrierData.states}` : ''}
${carrierData?.appetite ? `Appetite: ${carrierData.appetite}` : ''}
${originalContext?.state ? `Requested State: ${originalContext.state}` : ''}
${originalContext?.lob ? `Line of Business: ${originalContext.lob}` : ''}
${originalContext?.coverage ? `Coverage Amount: $${originalContext.coverage.toLocaleString()}` : ''}

Agency Contact Info:
- Agency: ${AGENCY_CONTACT.name}
- Placement Desk: ${AGENCY_CONTACT.placementDesk}
- Email: ${AGENCY_CONTACT.email}

Generate a professional placement summary in markdown format with:
## ${carrierName} - Placement Summary

### Overview
(1-2 sentences about why this is a good fit)

### Key Information
| Attribute | Details |
|-----------|---------|
(Fill in carrier details including Type: Direct/Wholesaler/MGA)

### Coverage & Requirements
(3-4 bullet points about typical requirements)

### Next Steps
(3 numbered steps for the agent to proceed)

### Contact Information
(Include the agency contact info in a table format)

Keep it professional and actionable.`;

  try {
    const response = await callLLM(prompt);
    return response;
  } catch (error) {
    console.error('[AIProcessor] Error generating carrier details:', error);
    return generateTemplateCarrierDetails(carrierName, carrierData);
  }
}

/**
 * Call LLM API
 * @param prompt - The prompt to send to the LLM
 * @param maxTokens - Maximum tokens for the response (default: 2500 for detailed responses)
 */
async function callLLM(prompt: string, maxTokens: number = 2500): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      'X-Title': 'Insurance Placement AI'
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert insurance placement advisor. Be concise, professional, and actionable.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Template-based fallback for market insights
 */
function generateTemplateInsights(context: SearchContext): string {
  const directCount = context.carriers.filter(c =>
    !c.considerations.some(con => con.toLowerCase().includes('wholesaler'))
  ).length;

  let insights = `The **${context.state}** ${context.lob} market has `;

  if (directCount === context.carriers.length) {
    insights += 'strong direct market options';
  } else if (directCount > 0) {
    insights += 'both direct and wholesale options available';
  } else {
    insights += 'wholesale/E&S capacity available';
  }

  insights += ` with ${context.totalEligible} eligible carriers. `;

  if (context.coverage) {
    if (context.coverage >= 1000000) {
      insights += `For high-value coverage of **$${(context.coverage / 1000000).toFixed(1)}M**, consider carriers specializing in affluent markets.`;
    } else {
      insights += `**$${context.coverage.toLocaleString()}** coverage is well within standard market appetite.`;
    }
  }

  return insights;
}

/**
 * Template-based fallback for carrier details
 */
function generateTemplateCarrierDetails(
  carrierName: string,
  data: { knownFor?: string; states?: string; appetite?: string } | null
): string {
  return `## ${carrierName} - Placement Summary

### Overview
${carrierName} has been selected for this placement based on your requirements.${data?.knownFor ? ` Known for: ${data.knownFor}.` : ''}

### Key Information
| Attribute | Details |
|-----------|---------|
| Carrier | ${carrierName} |
| Type | Direct |
| States | ${data?.states || 'Multiple states'} |
| Known For | ${data?.knownFor || 'Various coverage types'} |
| Appetite | ${data?.appetite || 'Standard'} |

### Coverage & Requirements
- **Standard Requirements:** Property inspection may be required for high values
- **Documentation:** Prior claims history, property details, photos
- **Pricing:** Competitive rates for qualifying risks
- **Discounts:** Multi-policy and claims-free discounts available

### Next Steps
1. **Submit Application** - Complete the standard ACORD submission form
2. **Gather Documents** - Property details, prior claims history, photos if needed
3. **Await Quote** - Expect response within 24-48 hours

### Contact Information
| | |
|---|---|
| **Agency** | ${AGENCY_CONTACT.name} |
| **Placement Desk** | ${AGENCY_CONTACT.placementDesk} |
| **Email** | ${AGENCY_CONTACT.email} |

---
*Ready to submit? Contact the placement desk to proceed.*`;
}

// ============================================================================
// AI-ENHANCED QUERY PARSING
// ============================================================================

export interface ParsedQuery {
  state: string;
  lob: string;
  lobVariants: string[];  // Alternative LOB names to search
  coverage: number;
  intent: 'search' | 'followup' | 'general';
  riskFactors: string[];
  selectedCarrier?: string;
  confidence: number;
}

/**
 * Use AI to understand and parse user query
 * Extracts state, LOB, coverage with semantic understanding
 */
export async function aiParseQuery(userQuery: string): Promise<ParsedQuery> {
  if (!OPENROUTER_API_KEY) {
    console.log('[AIProcessor] No API key, using fallback parser');
    return fallbackParseQuery(userQuery);
  }

  const prompt = `You are an insurance query parser. Extract structured data from this query.

USER QUERY: "${userQuery}"

Extract and return a JSON object with these fields:
{
  "state": "2-letter state code (e.g., TX, CA) or empty string if not mentioned",
  "lob": "Primary line of business (use standard names like: Homeowners, Auto, Landlord/DP3, Condo, Renters, Commercial Auto, Workers Compensation, BOP, General Liability, Umbrella, Flood, Boat, Motorcycle, etc.)",
  "lobVariants": ["array of alternative LOB names to search, e.g., for 'rental property' include 'Landlord', 'DP3', 'Dwelling Fire'"],
  "coverage": number (coverage amount in dollars, 0 if not specified),
  "intent": "search" (new search) or "followup" (asking about specific carrier) or "general" (general question),
  "riskFactors": ["array of risk factors mentioned, e.g., 'investment property', 'high-value', 'coastal', 'new construction'"],
  "selectedCarrier": "carrier name if this is a followup query, otherwise null",
  "confidence": 0.0 to 1.0 (how confident you are in the extraction)
}

IMPORTANT LOB MAPPINGS:
- "rental property", "investment property", "tenant-occupied" → Landlord/DP3
- "dwelling fire" → Landlord/DP3
- "home", "house", "owner-occupied" → Homeowners
- "car", "vehicle" → Auto
- "business insurance", "small business" → BOP
- "work injury", "employee injury" → Workers Compensation
- "company vehicles", "fleet" → Commercial Auto

Return ONLY the JSON object, no explanation.`;

  try {
    const response = await callLLM(prompt, 500);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AIProcessor] Could not extract JSON from response');
      return fallbackParseQuery(userQuery);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    console.log('[AIProcessor] AI parsed query:', parsed);

    return {
      state: (parsed.state || '').toUpperCase(),
      lob: parsed.lob || '',
      lobVariants: parsed.lobVariants || [],
      coverage: parsed.coverage || 0,
      intent: parsed.intent || 'search',
      riskFactors: parsed.riskFactors || [],
      selectedCarrier: parsed.selectedCarrier || undefined,
      confidence: parsed.confidence || 0.8,
    };
  } catch (error) {
    console.error('[AIProcessor] AI parsing failed:', error);
    return fallbackParseQuery(userQuery);
  }
}

/**
 * Fallback parser using regex (when AI is unavailable)
 */
function fallbackParseQuery(query: string): ParsedQuery {
  const queryLower = query.toLowerCase();

  // Extract state
  let state = '';
  const stateMatch = query.match(/\b([A-Z]{2})\b/);
  if (stateMatch) state = stateMatch[1];

  // Extract LOB (simple keyword matching)
  let lob = '';
  const lobVariants: string[] = [];

  if (queryLower.includes('home') || queryLower.includes('house')) {
    lob = 'Homeowners';
    lobVariants.push('homeowners', 'home', 'ho3');
  } else if (queryLower.includes('rental') || queryLower.includes('landlord') || queryLower.includes('dp3')) {
    lob = 'Landlord/DP3';
    lobVariants.push('landlord', 'dp3', 'dwelling fire');
  } else if (queryLower.includes('auto') || queryLower.includes('car')) {
    lob = 'Auto';
    lobVariants.push('auto', 'personal auto');
  } else if (queryLower.includes('commercial auto') || queryLower.includes('fleet')) {
    lob = 'Commercial Auto';
    lobVariants.push('commercial auto', 'commercialauto');
  } else if (queryLower.includes('workers comp') || queryLower.includes('work comp')) {
    lob = 'Workers Compensation';
    lobVariants.push('workers comp', 'workerscomp', 'workers compensation');
  } else if (queryLower.includes('bop') || queryLower.includes('business owner')) {
    lob = 'BOP';
    lobVariants.push('bop', 'business owners policy', 'packaged');
  }

  // Extract coverage
  let coverage = 0;
  const coverageMatch = query.match(/\$\s*([\d,]+)/);
  if (coverageMatch) {
    coverage = parseInt(coverageMatch[1].replace(/,/g, ''));
  }

  // Detect intent
  let intent: 'search' | 'followup' | 'general' = 'search';
  if (queryLower.includes('proceed with') || queryLower.includes('select') ||
      queryLower.includes('tell me about') || queryLower.includes('more details')) {
    intent = 'followup';
  }

  return {
    state,
    lob,
    lobVariants,
    coverage,
    intent,
    riskFactors: [],
    confidence: 0.6,
  };
}

// ============================================================================
// AI-ENHANCED CARRIER RANKING
// ============================================================================

export interface CarrierForRanking {
  carrier_raw: string;
  carrier_key: string;
  known_for: string;
  state_raw: string;
  appetite_status: string;
  appetite_raw: string;
  carrier_type: string;
  lob_raw: string;
}

export interface AIRankedCarrier {
  rank: number;
  carrier: string;
  carrierKey: string;
  score: number;
  reasoning: string;
  strengths: string[];
  considerations: string[];
  appetiteStatus: string;
  carrierType: string;
}

export interface AIRankingResult {
  recommendations: AIRankedCarrier[];
  marketInsights: string;
  warnings: string[];
}

/**
 * Use AI to intelligently rank carriers based on their actual data
 */
export async function aiRankCarriers(
  carriers: CarrierForRanking[],
  context: {
    state: string;
    lob: string;
    coverage: number;
    riskFactors: string[];
  }
): Promise<AIRankingResult> {
  if (!OPENROUTER_API_KEY || carriers.length === 0) {
    console.log('[AIProcessor] No API key or no carriers, using fallback ranking');
    return fallbackRankCarriers(carriers, context);
  }

  // Limit carriers sent to AI to avoid token limits
  const topCarriers = carriers.slice(0, 10);

  const carrierDataStr = topCarriers.map((c, i) => `
${i + 1}. ${c.carrier_raw}
   - Known For: ${c.known_for || 'General insurance'}
   - States: ${c.state_raw || 'Multiple states'}
   - Appetite: ${c.appetite_status} ${c.appetite_raw ? `- ${c.appetite_raw}` : ''}
   - Type: ${c.carrier_type || 'Direct'}
   - LOB: ${c.lob_raw}`).join('\n');

  const prompt = `You are an expert insurance placement advisor. Analyze these carriers and rank the TOP 3 best matches.

SEARCH CRITERIA:
- State: ${context.state || 'Not specified'}
- Line of Business: ${context.lob}
- Coverage Amount: ${context.coverage ? `$${context.coverage.toLocaleString()}` : 'Not specified'}
- Risk Factors: ${context.riskFactors.length > 0 ? context.riskFactors.join(', ') : 'None specified'}

AVAILABLE CARRIERS:
${carrierDataStr}

RANKING CRITERIA (in order of importance):
1. LOB SPECIALIZATION - Carriers whose "Known For" matches the requested LOB
2. STATE EXPERTISE - Carriers that specialize in or explicitly cover the state
3. APPETITE STRENGTH - "yes" > "conditional" > "limited"
4. COVERAGE FIT - Appropriate for the coverage amount
5. CARRIER TYPE - Direct carriers preferred over Wholesalers for standard risks

Return a JSON object:
{
  "recommendations": [
    {
      "rank": 1,
      "carrier": "Carrier Name",
      "carrierKey": "carrier_key from data",
      "score": 0.85 to 0.95,
      "reasoning": "1-2 sentence explanation of why this is a top pick",
      "strengths": ["strength 1", "strength 2"],
      "considerations": ["consideration 1"],
      "appetiteStatus": "Strong Appetite/Conditional/Limited",
      "carrierType": "Direct/Wholesaler/MGA"
    }
  ],
  "marketInsights": "2-3 sentence market assessment for this LOB in this state",
  "warnings": ["any warnings or caveats"]
}

Return ONLY the JSON object. Include exactly 3 recommendations (or fewer if less than 3 carriers available).`;

  try {
    const response = await callLLM(prompt, 1500);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AIProcessor] Could not extract JSON from ranking response');
      return fallbackRankCarriers(carriers, context);
    }

    const result = JSON.parse(jsonMatch[0]);

    console.log('[AIProcessor] AI ranking result:', {
      recommendationCount: result.recommendations?.length,
      topCarrier: result.recommendations?.[0]?.carrier,
    });

    return {
      recommendations: result.recommendations || [],
      marketInsights: result.marketInsights || '',
      warnings: result.warnings || [],
    };
  } catch (error) {
    console.error('[AIProcessor] AI ranking failed:', error);
    return fallbackRankCarriers(carriers, context);
  }
}

// ============================================================================
// AI ENHANCEMENT FOR HYBRID RANKING
// ============================================================================

export interface EnhancedRankingResult {
  recommendations: CarrierRecommendation[];
  marketInsights: string;
  warnings: string[];
}

/**
 * AI Enhancement for Hybrid Ranking
 * Takes rule-based ranked carriers and enhances them with AI-generated insights.
 * Does NOT change the ranking or carrier selection - only improves descriptions.
 */
export async function aiEnhanceRanking(
  ruleBasedRecommendations: CarrierRecommendation[],
  carrierRecords: CarrierAppetiteRecord[],
  context: {
    state: string;
    lob: string;
    coverage: number;
    riskFactors: string[];
  }
): Promise<EnhancedRankingResult> {
  if (!OPENROUTER_API_KEY || ruleBasedRecommendations.length === 0) {
    console.log('[AIProcessor] No API key or no recommendations, returning as-is');
    return {
      recommendations: ruleBasedRecommendations,
      marketInsights: '',
      warnings: [],
    };
  }

  // Build carrier data string for the prompt
  const carrierDataStr = ruleBasedRecommendations.map((rec, i) => {
    const record = carrierRecords[i];
    return `
${rec.rank}. ${rec.carrier}
   - Match Score: ${rec.matchScore}
   - Appetite: ${rec.appetiteStatus}
   - Known For: ${record?.known_for || 'General insurance'}
   - States: ${record?.state_raw || 'Multiple states'}
   - Current Overview: ${rec.overview}
   - Current Strengths: ${rec.strengths.join(', ')}`;
  }).join('\n');

  const prompt = `You are an expert insurance placement advisor. Enhance these carrier recommendations with better insights.

SEARCH CRITERIA:
- State: ${context.state || 'Not specified'}
- Line of Business: ${context.lob}
- Coverage Amount: ${context.coverage ? `$${context.coverage.toLocaleString()}` : 'Not specified'}
- Risk Factors: ${context.riskFactors.length > 0 ? context.riskFactors.join(', ') : 'Standard risk'}

ALREADY RANKED CARRIERS (DO NOT CHANGE RANKING):
${carrierDataStr}

IMPORTANT: Keep the EXACT SAME carriers in the EXACT SAME order. Only enhance the descriptions.

Return a JSON object:
{
  "recommendations": [
    {
      "rank": 1,
      "carrier": "Exact carrier name from input",
      "matchScore": same score as input,
      "appetiteStatus": same as input,
      "overview": "Enhanced 1-2 sentence overview explaining why this carrier is ideal for this specific search",
      "stateAnalysis": {
        "eligible": true,
        "details": "Specific details about state coverage"
      },
      "coverageAnalysis": {
        "acceptable": true,
        "details": "Coverage assessment"
      },
      "underwritingNotes": "Key underwriting considerations",
      "strengths": ["strength1", "strength2"],
      "considerations": ["consideration1"],
      "recommendation": "Actionable recommendation"
    }
  ],
  "marketInsights": "2-3 sentence market assessment for this LOB in this state",
  "warnings": []
}

Return ONLY valid JSON.`;

  try {
    const response = await callLLM(prompt, 2000);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AIProcessor] Could not extract JSON from enhancement response');
      return {
        recommendations: ruleBasedRecommendations,
        marketInsights: '',
        warnings: [],
      };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate that carriers match
    if (result.recommendations && result.recommendations.length > 0) {
      const aiCarriers = result.recommendations.map((r: CarrierRecommendation) => r.carrier.toLowerCase());
      const originalCarriers = ruleBasedRecommendations.map(r => r.carrier.toLowerCase());

      // Check if AI returned the same carriers
      const allMatch = originalCarriers.every((c, i) => {
        const aiCarrier = aiCarriers[i];
        return aiCarrier && (aiCarrier.includes(c) || c.includes(aiCarrier) || aiCarrier === c);
      });

      if (!allMatch) {
        console.warn('[AIProcessor] AI returned different carriers, using original recommendations with AI insights only');
        return {
          recommendations: ruleBasedRecommendations,
          marketInsights: result.marketInsights || '',
          warnings: result.warnings || [],
        };
      }

      // Merge AI enhancements with original data (keep original carrier names and scores)
      const enhanced: CarrierRecommendation[] = ruleBasedRecommendations.map((orig, i) => {
        const aiRec = result.recommendations[i];
        if (!aiRec) return orig;

        return {
          ...orig,
          // Keep original: rank, carrier, matchScore
          // Enhance with AI:
          overview: aiRec.overview || orig.overview,
          stateAnalysis: aiRec.stateAnalysis || orig.stateAnalysis,
          coverageAnalysis: aiRec.coverageAnalysis || orig.coverageAnalysis,
          underwritingNotes: aiRec.underwritingNotes || orig.underwritingNotes,
          strengths: aiRec.strengths && aiRec.strengths.length > 0 ? aiRec.strengths : orig.strengths,
          considerations: aiRec.considerations && aiRec.considerations.length > 0 ? aiRec.considerations : orig.considerations,
          recommendation: aiRec.recommendation || orig.recommendation,
        };
      });

      console.log('[AIProcessor] AI enhancement successful');
      return {
        recommendations: enhanced,
        marketInsights: result.marketInsights || '',
        warnings: result.warnings || [],
      };
    }

    return {
      recommendations: ruleBasedRecommendations,
      marketInsights: result.marketInsights || '',
      warnings: result.warnings || [],
    };
  } catch (error) {
    console.error('[AIProcessor] AI enhancement failed:', error);
    return {
      recommendations: ruleBasedRecommendations,
      marketInsights: '',
      warnings: [],
    };
  }
}

/**
 * Fallback ranking when AI is unavailable
 */
function fallbackRankCarriers(
  carriers: CarrierForRanking[],
  context: { state: string; lob: string; coverage: number }
): AIRankingResult {
  const lobLower = context.lob.toLowerCase();
  const stateLower = context.state.toLowerCase();

  // Simple scoring
  const scored = carriers.map(c => {
    let score = 50;
    const knownForLower = (c.known_for || '').toLowerCase();
    const stateRawLower = (c.state_raw || '').toLowerCase();

    // LOB match
    if (knownForLower.includes(lobLower) || lobLower.includes(knownForLower.split(',')[0])) {
      score += 20;
    }

    // State match
    if (stateRawLower.includes(stateLower) || stateRawLower.includes('all states')) {
      score += 10;
    }

    // Appetite
    if (c.appetite_status === 'yes') score += 10;
    else if (c.appetite_status === 'conditional') score += 5;

    // Prefer direct carriers
    if ((c.carrier_type || '').toLowerCase() === 'direct') score += 5;

    return { carrier: c, score };
  });

  // Sort and take top 3
  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);

  const recommendations: AIRankedCarrier[] = top3.map((item, idx) => ({
    rank: idx + 1,
    carrier: item.carrier.carrier_raw,
    carrierKey: item.carrier.carrier_key,
    score: Math.min(0.95, item.score / 100),
    reasoning: `${item.carrier.carrier_raw} has appetite for ${context.lob} in ${context.state || 'your state'}.`,
    strengths: [item.carrier.known_for || 'General coverage'].slice(0, 2),
    considerations: item.carrier.carrier_type === 'Wholesaler' ? ['Wholesaler fees may apply'] : ['Standard underwriting'],
    appetiteStatus: item.carrier.appetite_status === 'yes' ? 'Strong Appetite' : 'Conditional',
    carrierType: item.carrier.carrier_type || 'Direct',
  }));

  return {
    recommendations,
    marketInsights: `The ${context.state || ''} ${context.lob} market has ${carriers.length} eligible carriers.`,
    warnings: [],
  };
}
