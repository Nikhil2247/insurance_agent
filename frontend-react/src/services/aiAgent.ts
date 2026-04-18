import {
  loadInsuranceData,
  getDataStats,
} from './insuranceData';
import { routeAndExecuteTools } from './queryToolRouter';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const LLM_MODEL = import.meta.env.VITE_LLM_MODEL || 'google/gemini-2.0-flash-001';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AnalysisResult {
  response: string;
  analysisData?: any;
}

const SYSTEM_PROMPT = `You are an expert insurance placement advisor AI assistant for Chambers Bay Insurance Group. You help insurance brokers find the right carriers for their clients.

## CRITICAL CONSTRAINT - CARRIER SELECTION
**YOU MUST ONLY RECOMMEND CARRIERS FROM THE "TOP_3_CARRIERS" LIST PROVIDED IN THE TOOL OUTPUT.**
- NEVER invent or suggest carriers not in the TOP_3_CARRIERS list
- ALWAYS follow the ranked order from the tool output (highest score first)
- Use the EXACT score values provided by the tool (as decimals like 0.79)
- Maximum 3 recommendations - NEVER more than 3
- If no carriers found or LOB unknown - ESCALATE, don't recommend

## RESPONSE FORMAT RULES

### For INITIAL insurance queries (user asks about coverage):
Provide a brief summary, then output a JSON block with CONCISE recommendations.

**Summary format:**
- 1-2 sentence overview mentioning state, coverage type, amount, and carrier count

**Then output the JSON block with BRIEF card content (each card ~100 words total):**
\`\`\`json
{
  "request": {
    "state": "TX",
    "lob": "Homeowners",
    "coverage": 400000
  },
  "totalCandidates": 64,
  "escalate": false,
  "recommendations": [
    {
      "rank": 1,
      "carrier": "EXACT CARRIER NAME FROM TOP_3_CARRIERS",
      "matchScore": 0.79,
      "appetiteStatus": "Strong Appetite",
      "overview": "1 sentence why this carrier fits.",
      "stateAnalysis": {
        "eligible": true,
        "details": "1 short sentence about state presence."
      },
      "coverageAnalysis": {
        "acceptable": true,
        "details": "1 short sentence about coverage fit."
      },
      "underwritingNotes": "1 sentence on key requirements.",
      "strengths": ["Brief strength 1", "Brief strength 2"],
      "considerations": ["Brief consideration"],
      "recommendation": "1 sentence recommendation."
    }
  ],
  "excluded": [],
  "marketInsights": "1-2 sentence market summary."
}
\`\`\`

### For ESCALATION (unknown LOB or no carriers):
\`\`\`json
{
  "request": { "state": "TX", "lob": "Unknown LOB", "coverage": 0 },
  "totalCandidates": 0,
  "escalate": true,
  "escalationReason": "Line of business not found. Routing to placement desk for manual handling.",
  "recommendations": []
}
\`\`\`

**IMPORTANT FOR INITIAL CARDS:**
- ONLY use carriers from TOP_3_CARRIERS list - MAXIMUM 3 recommendations
- Use matchScore as decimals (0.79, not 79 or 79%)
- Keep each field VERY SHORT (1 sentence max)
- Total card content should be ~100 words
- strengths: 2 items max, 3-5 words each
- considerations: 1 item, 3-5 words
- Save detailed info for when user selects a carrier

### For FOLLOW-UP messages (user selects a carrier):
When user says "I'd like to proceed with [Carrier]" - this is a FOLLOW-UP about their ORIGINAL query.

DO NOT output JSON. Instead, provide a CONCISE detailed response (300-400 words max):

**Format your response like this:**

## [Carrier Name] - Placement Summary

### Overview
1-2 sentences about the carrier and fit for the request.

### Key Information
| Attribute | Details |
|-----------|---------|
| States | Key states listed |
| Known For | Main specialties |
| Type | Direct/Wholesaler |

### Coverage & Requirements
- **Limits:** Typical range
- **Key Requirements:** 2-3 bullet points
- **Pricing:** Brief estimate

### Next Steps
1. Submit application via [method]
2. Required documents
3. Expected timeline

---

## CRITICAL RULES:
1. **ONLY USE CARRIERS FROM TOP_3_CARRIERS LIST** - This is mandatory, MAXIMUM 3
2. Use EXACT matchScore values from tool output AS DECIMALS (0.79 not 79)
3. appetiteStatus: "Strong Appetite", "Moderate Appetite", "Limited Appetite", or "Conditional"
4. Rank by matchScore descending (highest score = rank 1)
5. For INITIAL queries: Keep card content BRIEF (~100 words per card)
6. For FOLLOW-UPS: Keep responses CONCISE (300-400 words max)
7. If zero carriers or unknown LOB: SET escalate: true, DO NOT recommend
8. **BOLD important terms** using **markdown bold syntax**:
   - Coverage amounts (e.g., **$500,000**)
   - Important limits (e.g., **minimum $300k underlying**)
   - Key requirements (e.g., **3+ years claims-free**)
   - Carrier names when mentioned in text
   - Critical warnings or notes
   - Percentages and discounts (e.g., **15% multi-policy discount**)
   - Policy types (e.g., **HO-3**, **HO-5**)`;

// Parse state and LOB from user message
function parseSearchCriteria(message: string): { state: string; lob: string; coverage: number; isFollowUp: boolean; selectedCarrier: string } {
  const messageLower = message.toLowerCase();

  // Check if this is a follow-up (user selecting a carrier)
  const followUpPatterns = [
    /i'd like to proceed with\s+\*?\*?([^(*]+)/i,
    /proceed with\s+\*?\*?([^(*]+)/i,
    /select\s+\*?\*?([^(*]+)/i,
    /choose\s+\*?\*?([^(*]+)/i,
    /more details about\s+\*?\*?([^(*]+)/i,
    /tell me more about\s+\*?\*?([^(*]+)/i
  ];

  for (const pattern of followUpPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        state: '',
        lob: '',
        coverage: 0,
        isFollowUp: true,
        selectedCarrier: match[1].trim().replace(/\*+/g, '').trim()
      };
    }
  }

  // Common state abbreviations and names
  const statePatterns: [RegExp, string][] = [
    [/\b(alabama)\b/i, 'AL'], [/\b(alaska)\b/i, 'AK'], [/\b(arizona)\b/i, 'AZ'], [/\b(arkansas)\b/i, 'AR'],
    [/\b(california)\b/i, 'CA'], [/\b(colorado)\b/i, 'CO'], [/\b(connecticut)\b/i, 'CT'], [/\b(delaware)\b/i, 'DE'],
    [/\b(florida)\b/i, 'FL'], [/\b(georgia)\b/i, 'GA'], [/\b(hawaii)\b/i, 'HI'], [/\b(idaho)\b/i, 'ID'],
    [/\b(illinois)\b/i, 'IL'], [/\b(indiana)\b/i, 'IN'], [/\b(iowa)\b/i, 'IA'], [/\b(kansas)\b/i, 'KS'],
    [/\b(kentucky)\b/i, 'KY'], [/\b(louisiana)\b/i, 'LA'], [/\b(maine)\b/i, 'ME'], [/\b(maryland)\b/i, 'MD'],
    [/\b(massachusetts)\b/i, 'MA'], [/\b(michigan)\b/i, 'MI'], [/\b(minnesota)\b/i, 'MN'], [/\b(mississippi)\b/i, 'MS'],
    [/\b(missouri)\b/i, 'MO'], [/\b(montana)\b/i, 'MT'], [/\b(nebraska)\b/i, 'NE'], [/\b(nevada)\b/i, 'NV'],
    [/\b(new hampshire)\b/i, 'NH'], [/\b(new jersey)\b/i, 'NJ'], [/\b(new mexico)\b/i, 'NM'], [/\b(new york)\b/i, 'NY'],
    [/\b(north carolina)\b/i, 'NC'], [/\b(north dakota)\b/i, 'ND'], [/\b(ohio)\b/i, 'OH'], [/\b(oklahoma)\b/i, 'OK'],
    [/\b(oregon)\b/i, 'OR'], [/\b(pennsylvania)\b/i, 'PA'], [/\b(rhode island)\b/i, 'RI'], [/\b(south carolina)\b/i, 'SC'],
    [/\b(south dakota)\b/i, 'SD'], [/\b(tennessee)\b/i, 'TN'], [/\b(texas)\b/i, 'TX'], [/\b(utah)\b/i, 'UT'],
    [/\b(vermont)\b/i, 'VT'], [/\b(virginia)\b/i, 'VA'], [/\b(washington)\b/i, 'WA'], [/\b(west virginia)\b/i, 'WV'],
    [/\b(wisconsin)\b/i, 'WI'], [/\b(wyoming)\b/i, 'WY'],
    // State abbreviations - case sensitive
    [/\bAL\b/, 'AL'], [/\bAK\b/, 'AK'], [/\bAZ\b/, 'AZ'], [/\bAR\b/, 'AR'],
    [/\bCA\b/, 'CA'], [/\bCO\b/, 'CO'], [/\bCT\b/, 'CT'], [/\bDE\b/, 'DE'],
    [/\bFL\b/, 'FL'], [/\bGA\b/, 'GA'], [/\bHI\b/, 'HI'], [/\bID\b/, 'ID'],
    [/\bIL\b/, 'IL'], [/\bIA\b/, 'IA'], [/\bKS\b/, 'KS'], [/\bKY\b/, 'KY'],
    [/\bLA\b/, 'LA'], [/\bMD\b/, 'MD'], [/\bMA\b/, 'MA'], [/\bMI\b/, 'MI'],
    [/\bMN\b/, 'MN'], [/\bMS\b/, 'MS'], [/\bMO\b/, 'MO'], [/\bMT\b/, 'MT'],
    [/\bNE\b/, 'NE'], [/\bNV\b/, 'NV'], [/\bNH\b/, 'NH'], [/\bNJ\b/, 'NJ'],
    [/\bNM\b/, 'NM'], [/\bNY\b/, 'NY'], [/\bNC\b/, 'NC'], [/\bND\b/, 'ND'],
    [/\bOH\b/, 'OH'], [/\bOK\b/, 'OK'], [/\bPA\b/, 'PA'], [/\bRI\b/, 'RI'],
    [/\bSC\b/, 'SC'], [/\bSD\b/, 'SD'], [/\bTN\b/, 'TN'], [/\bTX\b/, 'TX'],
    [/\bUT\b/, 'UT'], [/\bVT\b/, 'VT'], [/\bVA\b/, 'VA'], [/\bWA\b/, 'WA'],
    [/\bWV\b/, 'WV'], [/\bWI\b/, 'WI'], [/\bWY\b/, 'WY']
  ];

  // Common LOB keywords mapped to standard names
  const lobMappings: [string[], string][] = [
    // Home/Dwelling - order matters, more specific first
    [['dwelling fire', 'dwelling policy', 'tenant-occupied', 'tenant occupied'], 'Landlord'],
    [['home insurance', 'homeowners', 'homeowner', 'home policy', 'owner-occupied', 'owner occupied'], 'Homeowners'],
    [['landlord', 'dp3', 'dp-3', 'rental property', 'investment property'], 'Landlord'],
    [['condo', 'condominium', 'unit owner', 'ho6', 'ho-6'], 'Condo'],
    [['renters', 'renter', 'ho4', 'ho-4', 'tenant insurance'], 'Renters'],
    [['manufactured home', 'mobile home', 'modular home'], 'Manufactured Home'],

    // Auto
    [['personal auto', 'auto insurance', 'car insurance', 'vehicle insurance'], 'Auto'],
    [['commercial auto', 'business auto', 'fleet'], 'Commercial Auto'],
    [['classic car', 'collector car', 'antique car', 'vintage car'], 'Collector Cars'],
    [['motorcycle', 'motorbike'], 'Motorcycle'],

    // Commercial
    [['bop', 'business owners policy', 'business owners', 'business owner policy', 'packaged'], 'BOP'],
    [['general liability', 'gl', 'liability insurance'], 'General Liability'],
    [['workers comp', 'workers compensation', 'work comp', 'workman comp'], 'Workers Compensation'],
    [['commercial property', 'business property'], 'Commercial Property'],
    [['professional liability', 'pl', 'professional'], 'Professional Liability'],
    [['cyber', 'cyber liability', 'cyber insurance', 'data breach'], 'Cyber'],

    // Umbrella/Excess
    [['umbrella', 'excess liability', 'excess', 'personal umbrella'], 'Umbrella'],

    // Specialty
    [['flood', 'flood insurance', 'flood coverage'], 'Flood'],
    [['earthquake', 'quake'], 'Earthquake'],
    [['boat', 'watercraft', 'marine', 'vessel'], 'Boat'],
    [['yacht'], 'Yachts'],
    [['rv', 'recreational vehicle', 'motorhome', 'camper'], 'RV'],
    [['jewelry', 'jewelry floater', 'valuable articles', 'personal articles'], 'Jewelry Floater'],
    [['travel', 'trip'], 'Travel'],
    [['pet', 'pet insurance'], 'Pet'],

    // Fallback for "home" without qualifiers
    [['home'], 'Homeowners']
  ];

  let state = '';
  let lob = '';
  let coverage = 0;

  // Find state
  for (const [pattern, abbrev] of statePatterns) {
    if (pattern.test(message)) {
      state = abbrev;
      break;
    }
  }

  // Find LOB
  for (const [keywords, standardName] of lobMappings) {
    for (const keyword of keywords) {
      if (messageLower.includes(keyword)) {
        lob = standardName;
        break;
      }
    }
    if (lob) break;
  }

  // Find coverage amount
  const coverageMatch = message.match(/\$\s*([\d,]+)/);
  if (coverageMatch) {
    coverage = parseInt(coverageMatch[1].replace(/,/g, ''));
  }

  return { state, lob, coverage, isFollowUp: false, selectedCarrier: '' };
}

// Call OpenRouter API
async function callLLM(messages: ChatMessage[]): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured. Please add VITE_OPENROUTER_API_KEY to your .env file.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Insurance Placement AI'
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens:4000, 
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to get AI response');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'No response generated';
}

// Main chat function
export async function chat(
  userMessage: string,
  history: ChatMessage[] = []
): Promise<AnalysisResult> {
  // Ensure data is loaded
  await loadInsuranceData();

  // Parse search criteria from user message
  const { state, lob, coverage, isFollowUp, selectedCarrier } = parseSearchCriteria(userMessage);

  console.log('Parsed criteria:', { state, lob, coverage, isFollowUp, selectedCarrier });

  // Build messages for LLM
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  // Add conversation history
  history.forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });

  // Store tool result for validation later
  let toolResult: Awaited<ReturnType<typeof routeAndExecuteTools>> | null = null;

  if (isFollowUp) {
    // This is a follow-up - user selected a carrier
    // Extract original context from history
    let originalContext = '';
    for (const h of history) {
      if (h.role === 'user' && !h.content.toLowerCase().includes('proceed with')) {
        originalContext = h.content;
        break;
      }
    }

    messages.push({
      role: 'system',
      content: `IMPORTANT: This is a FOLLOW-UP message. The user has selected "${selectedCarrier}" from previous recommendations.

Original request context: "${originalContext}"

DO NOT generate a new JSON analysis. Instead, provide a CONCISE placement summary (300-400 words max) for ${selectedCarrier}. Use markdown formatting with a brief table and bullet points.

Include briefly:
- 1-2 sentence overview
- Key info table (states, known for, type)
- Coverage limits & key requirements (2-3 bullets)
- Next steps (3 numbered steps)`
    });
  } else {
    // This is a new query - route by intent and execute the right tools.
    toolResult = await routeAndExecuteTools({
      query: userMessage,
      state,
      lob,
      limit: 10,
      coverageAmount: coverage,
    });

    console.log('Tool routing:', toolResult.intent, toolResult.usedTools);

    const totalEligible = toolResult.rankedCandidates.length;
    const shouldEscalate = totalEligible === 0;

    // Extract top 3 carriers for explicit instruction
    const top3Carriers = toolResult.rankedCandidates.slice(0, 3);
    const carrierSummary = top3Carriers.map((c, i) => {
      const scoreDecimal = (c.matchScore / 100).toFixed(2);
      return `${i + 1}. ${c.carrier} (score: ${scoreDecimal}, type: ${c.type}, knownFor: ${c.knownFor || 'N/A'})`;
    }).join('\n');

    // Build warnings
    const warnings: string[] = [];
    if (!state) warnings.push('State not specified - scores may be lower');
    if (!coverage) warnings.push('Coverage amount not provided - some coverage-limit rules were not applied');

    messages.push({
      role: 'system',
      content: `## USER REQUEST
- State: ${state || 'NOT SPECIFIED'}
- Coverage Type: ${lob || 'NOT SPECIFIED'}
- Coverage Amount: ${coverage ? `$${coverage.toLocaleString()}` : 'NOT SPECIFIED'}

## TOOL RESULTS
- Total Eligible Carriers: ${totalEligible}
- Escalate: ${shouldEscalate}
${warnings.length > 0 ? `- Warnings: ${warnings.join('; ')}` : ''}

## TOP_3_CARRIERS (USE ONLY THESE - IN THIS EXACT ORDER):
${shouldEscalate ? 'NONE - MUST ESCALATE' : carrierSummary}

## STRICT INSTRUCTIONS
${shouldEscalate ? `
1. SET escalate: true
2. SET escalationReason: "Line of business not found. Routing to placement desk for manual handling."
3. DO NOT recommend any carriers
4. SET recommendations: []
` : `
1. Recommend EXACTLY these 3 carriers in this order (or fewer if less available)
2. Use carrier names EXACTLY as shown above
3. Convert scores to decimals: divide by 100 (e.g., 79 → 0.79)
4. Include knownFor in reasoning
5. Set totalEligibleCarriers: ${totalEligible}
6. Set escalate: false
7. NEVER invent or add carriers not in TOP_3_CARRIERS list
`}`
    });
  }

  messages.push({ role: 'user', content: userMessage });

  // Get AI response
  const response = await callLLM(messages);

  console.log('AI Response preview:', response.substring(0, 300));

  // Try to parse analysis data from response (only for non-follow-ups)
  let analysisData = null;
  if (!isFollowUp && toolResult) {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[1]);
        console.log('Parsed analysis data with', analysisData?.recommendations?.length, 'recommendations');

        // Validate and correct recommendations against tool output
        if (analysisData?.recommendations && toolResult.rankedCandidates) {
          analysisData = validateAndCorrectRecommendations(analysisData, toolResult.rankedCandidates);
        }
      }
    } catch (e) {
      console.error('JSON parsing failed:', e);
    }
  }

  return {
    response,
    analysisData
  };
}

// Validate and correct LLM recommendations against tool output
function validateAndCorrectRecommendations(
  analysisData: any,
  rankedCandidates: Array<{
    carrier: string;
    matchScore: number;
    appetiteStatus: string;
    type: string;
    statesOperatingIn: string;
    knownFor: string;
    rationale: string[];
  }>
): any {
  // Handle escalation case
  if (analysisData?.escalate === true || rankedCandidates?.length === 0) {
    return {
      ...analysisData,
      escalate: true,
      recommendations: [],
      totalCandidates: 0
    };
  }

  if (!analysisData?.recommendations) {
    return analysisData;
  }

  const allowedCarriersMap = new Map(
    rankedCandidates.map(c => [c.carrier.toLowerCase(), c])
  );

  // Filter out recommendations for carriers not in allowed list
  const validRecommendations = analysisData.recommendations.filter((rec: any) => {
    const carrierLower = (rec.carrier || '').toLowerCase();
    return allowedCarriersMap.has(carrierLower);
  });

  // Correct scores and data from tool output
  const correctedRecommendations = validRecommendations.map((rec: any) => {
    const carrierLower = (rec.carrier || '').toLowerCase();
    const toolData = allowedCarriersMap.get(carrierLower);

    if (toolData) {
      const scoreDecimal = toolData.matchScore / 100;
      return {
        ...rec,
        carrier: toolData.carrier,
        matchScore: parseFloat(scoreDecimal.toFixed(2)),
        appetiteStatus: toolData.appetiteStatus,
      };
    }
    return rec;
  });

  // Re-sort by matchScore (descending) and re-rank, limit to 3
  correctedRecommendations.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
  const top3 = correctedRecommendations.slice(0, 3);
  top3.forEach((rec: any, idx: number) => {
    rec.rank = idx + 1;
  });

  // If we filtered out all recommendations, use top 3 from tool output
  if (top3.length === 0 && rankedCandidates.length > 0) {
    console.warn('All LLM recommendations were invalid, using tool output directly');
    return {
      ...analysisData,
      escalate: false,
      totalCandidates: rankedCandidates.length,
      recommendations: rankedCandidates.slice(0, 3).map((c, idx) => ({
        rank: idx + 1,
        carrier: c.carrier,
        matchScore: parseFloat((c.matchScore / 100).toFixed(2)),
        appetiteStatus: c.appetiteStatus,
        overview: `${c.knownFor || 'Insurance carrier'}`,
        stateAnalysis: {
          eligible: true,
          details: c.statesOperatingIn || 'Available in requested state'
        },
        coverageAnalysis: {
          acceptable: true,
          details: 'Coverage within carrier appetite'
        },
        underwritingNotes: c.rationale?.slice(0, 2).join('; ') || 'Standard underwriting applies',
        strengths: c.rationale?.slice(0, 2) || ['Direct market access'],
        considerations: c.type?.toLowerCase().includes('wholesaler') ? ['Wholesaler fees apply'] : ['Standard requirements'],
        recommendation: `${c.type?.toLowerCase().includes('direct') ? 'Direct market' : 'Wholesale'} option for this placement.`
      }))
    };
  }

  console.log(`Validated recommendations: ${top3.length} valid (limited to 3)`);

  return {
    ...analysisData,
    escalate: false,
    totalCandidates: rankedCandidates.length,
    recommendations: top3
  };
}

// Initialize the agent (load data)
export async function initializeAgent(): Promise<{
  ready: boolean;
  stats?: { totalCarriers: number; totalAppetiteRecords: number; totalCoverageTypes: number } | null;
}> {
  try {
    await loadInsuranceData();
    const stats = getDataStats();
    console.log('Agent initialized:', stats);
    return {
      ready: true,
      stats: {
        totalCarriers: stats.totalCarriers,
        totalAppetiteRecords: stats.totalRecords,
        totalCoverageTypes: stats.totalLobs
      }
    };
  } catch (error) {
    console.error('Agent initialization error:', error);
    return { ready: false };
  }
}

export { getDataStats };
