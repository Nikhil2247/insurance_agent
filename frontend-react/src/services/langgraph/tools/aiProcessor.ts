/**
 * AI Processor - Uses LLM to generate intelligent responses from carrier data
 */

import { AGENCY_CONTACT } from '../data/carrierDataIndex';

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
 */
async function callLLM(prompt: string): Promise<string> {
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
      max_tokens: 1000,
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
