import {
  loadInsuranceData,
  searchCarriers,
  getDataStats,
  getCarrierCoverageDetails,
  AppetiteRecord
} from './insuranceData';

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
  "totalCandidates": 5,
  "recommendations": [
    {
      "rank": 1,
      "carrier": "EXACT CARRIER NAME FROM DATA",
      "matchScore": 92,
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

**IMPORTANT FOR INITIAL CARDS:**
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
1. Use EXACT carrier names from the provided data (e.g., "Allstate", "American Modern", "Aegis")
2. matchScore must be 0-100
3. appetiteStatus: "Strong Appetite", "Moderate Appetite", "Limited Appetite", or "Conditional"
4. For INITIAL queries: Keep card content BRIEF (~100 words per card)
5. For FOLLOW-UPS: Keep responses CONCISE (300-400 words max)
6. Use tables and bullet points for readability
7. **BOLD important terms** using **markdown bold syntax** - bold key information like:
   - Coverage amounts (e.g., **$500,000**)
   - Important limits (e.g., **minimum $300k underlying**)
   - Key requirements (e.g., **3+ years claims-free**)
   - Carrier names when mentioned in text
   - Critical warnings or notes
   - Percentages and discounts (e.g., **15% multi-policy discount**)
   - Policy types (e.g., **HO-3**, **HO-5**)
   - Important dates or timeframes`;

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
    [/\b(al|alabama)\b/i, 'AL'], [/\b(ak|alaska)\b/i, 'AK'], [/\b(az|arizona)\b/i, 'AZ'], [/\b(ar|arkansas)\b/i, 'AR'],
    [/\b(ca|california)\b/i, 'CA'], [/\b(co|colorado)\b/i, 'CO'], [/\b(ct|connecticut)\b/i, 'CT'], [/\b(de|delaware)\b/i, 'DE'],
    [/\b(fl|florida)\b/i, 'FL'], [/\b(ga|georgia)\b/i, 'GA'], [/\b(hi|hawaii)\b/i, 'HI'], [/\b(id|idaho)\b/i, 'ID'],
    [/\b(il|illinois)\b/i, 'IL'], [/\b(in|indiana)\b/i, 'IN'], [/\b(ia|iowa)\b/i, 'IA'], [/\b(ks|kansas)\b/i, 'KS'],
    [/\b(ky|kentucky)\b/i, 'KY'], [/\b(la|louisiana)\b/i, 'LA'], [/\b(me|maine)\b/i, 'ME'], [/\b(md|maryland)\b/i, 'MD'],
    [/\b(ma|massachusetts)\b/i, 'MA'], [/\b(mi|michigan)\b/i, 'MI'], [/\b(mn|minnesota)\b/i, 'MN'], [/\b(ms|mississippi)\b/i, 'MS'],
    [/\b(mo|missouri)\b/i, 'MO'], [/\b(mt|montana)\b/i, 'MT'], [/\b(ne|nebraska)\b/i, 'NE'], [/\b(nv|nevada)\b/i, 'NV'],
    [/\b(nh|new hampshire)\b/i, 'NH'], [/\b(nj|new jersey)\b/i, 'NJ'], [/\b(nm|new mexico)\b/i, 'NM'], [/\b(ny|new york)\b/i, 'NY'],
    [/\b(nc|north carolina)\b/i, 'NC'], [/\b(nd|north dakota)\b/i, 'ND'], [/\b(oh|ohio)\b/i, 'OH'], [/\b(ok|oklahoma)\b/i, 'OK'],
    [/\b(or|oregon)\b/i, 'OR'], [/\b(pa|pennsylvania)\b/i, 'PA'], [/\b(ri|rhode island)\b/i, 'RI'], [/\b(sc|south carolina)\b/i, 'SC'],
    [/\b(sd|south dakota)\b/i, 'SD'], [/\b(tn|tennessee)\b/i, 'TN'], [/\b(tx|texas)\b/i, 'TX'], [/\b(ut|utah)\b/i, 'UT'],
    [/\b(vt|vermont)\b/i, 'VT'], [/\b(va|virginia)\b/i, 'VA'], [/\b(wa|washington)\b/i, 'WA'], [/\b(wv|west virginia)\b/i, 'WV'],
    [/\b(wi|wisconsin)\b/i, 'WI'], [/\b(wy|wyoming)\b/i, 'WY']
  ];

  // Common LOB keywords mapped to standard names
  const lobMappings: [string[], string][] = [
    [['home insurance', 'homeowners', 'homeowner', 'home', 'dwelling', 'residential'], 'Homeowners'],
    [['general liability', 'gl'], 'General Liability'],
    [['commercial auto', 'business auto'], 'Commercial Auto'],
    [['workers comp', 'workers compensation', 'work comp'], 'Workers Compensation'],
    [['commercial property', 'property'], 'Commercial Property'],
    [['bop', 'business owners', 'business owner policy'], 'Business Owners Policy'],
    [['professional liability', 'pl', 'professional'], 'Professional Liability'],
    [['cyber', 'cyber liability', 'cyber insurance'], 'Cyber Liability'],
    [['umbrella', 'excess liability', 'excess'], 'Umbrella'],
    [['epli', 'employment practices', 'employment'], 'Employment Practices Liability'],
    [['d&o', 'directors and officers', 'directors'], 'Directors & Officers'],
    [['e&o', 'errors and omissions'], 'Errors & Omissions'],
    [['inland marine', 'marine'], 'Inland Marine'],
    [['auto insurance', 'auto', 'car insurance'], 'Auto'],
    [['trucking', 'truck', 'commercial trucking'], 'Trucking'],
    [['contractors', 'contractor'], 'Contractors'],
    [['restaurant', 'restaurants'], 'Restaurant'],
    [['retail', 'store'], 'Retail'],
    [['manufacturing', 'manufacturer'], 'Manufacturing'],
    [['flood'], 'Flood'],
    [['renters', 'renter'], 'Renters'],
    [['condo'], 'Condo'],
    [['landlord', 'dp3', 'rental property'], 'Landlord'],
    [['boat', 'watercraft'], 'Boat'],
    [['rv', 'recreational vehicle', 'motorhome'], 'RV'],
    [['motorcycle'], 'Motorcycle']
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

// Format carrier data for the AI
function formatCarrierData(records: AppetiteRecord[], state: string, lob: string): string {
  if (records.length === 0) {
    return `No carriers found in database for ${lob} in ${state}. Use your knowledge of major insurance carriers to provide recommendations.`;
  }

  let formatted = `## Database Results: ${records.length} carriers for ${lob} in ${state}\n\n`;

  records.forEach((record, index) => {
    formatted += `### ${index + 1}. ${record.carrier}\n`;
    formatted += `| Field | Value |\n|-------|-------|\n`;
    formatted += `| States | ${record.statesOperatingIn || 'N/A'} |\n`;
    formatted += `| Known For | ${record.knownFor || 'N/A'} |\n`;
    formatted += `| Type | ${record.directOrWholesaler || 'N/A'} |\n`;
    formatted += `| Appetite | ${record.appetite} |\n`;
    if (record.details && record.details !== record.knownFor) {
      formatted += `| Details | ${record.details} |\n`;
    }

    // Get additional coverage details
    const extraDetails = getCarrierCoverageDetails(record.carrier, lob);
    if (extraDetails) {
      const lines = extraDetails.split('\n').filter(l =>
        !l.startsWith('States:') && !l.startsWith('Known For:') && !l.startsWith('Type:')
      );
      if (lines.length > 0) {
        formatted += `| Coverage Info | ${lines.join('; ')} |\n`;
      }
    }
    formatted += '\n';
  });

  return formatted;
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
      max_tokens: 800
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
    // This is a new query - search for carriers
    const carriers = searchCarriers(state, lob, 10);
    const contextData = formatCarrierData(carriers, state, lob);

    console.log('Found carriers:', carriers.length);

    messages.push({
      role: 'system',
      content: `## User Request
- **State:** ${state || 'Not specified'}
- **Coverage Type:** ${lob || 'Not specified'}
- **Coverage Amount:** ${coverage ? `$${coverage.toLocaleString()}` : 'Not specified'}

${contextData}

## Instructions
1. Use the carrier data above to make recommendations
2. Use EXACT carrier names from the data (e.g., "Allstate", "American Modern", "Aegis")
3. If database has limited results, you may supplement with major carriers you know operate in this market
4. Provide 3 recommendations with all required fields
5. Be specific and actionable`
    });
  }

  messages.push({ role: 'user', content: userMessage });

  // Get AI response
  const response = await callLLM(messages);

  console.log('AI Response preview:', response.substring(0, 300));

  // Try to parse analysis data from response (only for non-follow-ups)
  let analysisData = null;
  if (!isFollowUp) {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[1]);
        console.log('Parsed analysis data with', analysisData?.recommendations?.length, 'recommendations');
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

// Initialize the agent (load data)
export async function initializeAgent(): Promise<void> {
  await loadInsuranceData();
  const stats = getDataStats();
  console.log('Agent initialized:', stats);
}

export { getDataStats };
