/**
 * AI Agent Service - LangGraph Version
 *
 * Uses the LangGraph multi-tool agent system for carrier recommendations.
 * This replaces the direct LLM calls with a structured agent workflow.
 */

import { runInsuranceAgent, InsuranceAgentResult } from './langgraph';

export interface AgentResponse {
  response: string;
  analysisData: InsuranceAgentResult | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Process a user message through the LangGraph agent
 */
export async function processMessageWithAgent(
  userMessage: string,
  history: ChatMessage[] = []
): Promise<AgentResponse> {
  console.log('[AIAgent] Processing with LangGraph agent:', userMessage);

  // Check if this is a follow-up (user selecting a carrier)
  const isFollowUp = isFollowUpMessage(userMessage);

  if (isFollowUp) {
    return handleFollowUp(userMessage, history);
  }

  // Run the LangGraph agent
  const result = await runInsuranceAgent(userMessage);

  // Format the response
  const response = formatAgentResponse(result);

  return {
    response,
    analysisData: result,
  };
}

function isFollowUpMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("proceed with") ||
    lower.includes("select") ||
    lower.includes("choose") ||
    lower.includes("i'd like") ||
    lower.includes("go with") ||
    lower.includes("let's use")
  );
}

function handleFollowUp(message: string, _history: ChatMessage[]): AgentResponse {
  // Extract carrier name from message
  const carrierMatch = message.match(/(?:proceed with|select|choose|go with|use)\s+(.+?)(?:\.|$)/i);
  const carrierName = carrierMatch ? carrierMatch[1].trim() : 'the selected carrier';

  // Generate follow-up response
  const response = `
## ${carrierName} - Placement Summary

### Overview
${carrierName} is a strong choice for this placement based on your requirements.

### Key Information
| Attribute | Details |
|-----------|---------|
| Type | Direct Carrier |
| Known For | Home, Auto, Umbrella |
| States | Multiple states including requested |

### Next Steps
1. **Submit Application** - Use the standard submission portal
2. **Required Documents** - Property details, prior claims history, photos
3. **Expected Timeline** - Quote within 24-48 hours

### Contact
Reach out to your dedicated underwriter for expedited processing.

---
*Ready to submit? Click "Start Application" to proceed.*
`;

  return {
    response,
    analysisData: null,
  };
}

function formatAgentResponse(result: InsuranceAgentResult): string {
  // Handle escalation
  if (result.escalate) {
    return `⚠️ **Escalation Required**

${result.escalationReason || 'This request requires manual review by the placement desk.'}

**What happens next:**
1. Your request has been flagged for specialist review
2. A placement desk representative will contact you
3. Expected response within 1 business day

Please provide any additional details that may help with placement.`;
  }

  // Build summary text
  let response = `I have found **${result.totalEligibleCarriers}** eligible carriers for `;
  response += result.request.coverage
    ? `**$${result.request.coverage.toLocaleString()}** `
    : '';
  response += `**${result.request.lob}** coverage in **${result.request.state}**. `;
  response += `Here are the top ${result.recommendations.length} recommendations:\n\n`;

  // Add warnings if any
  if (result.warnings.length > 0) {
    response += `> ⚠️ ${result.warnings.join(' | ')}\n\n`;
  }

  // Format recommendations
  result.recommendations.forEach((rec, idx) => {
    const badge = idx === 0 ? '🏆 **Top Pick**' : idx === 1 ? '🥈 **2nd Choice**' : '🥉 **3rd Choice**';
    response += `### ${badge}: ${rec.carrier}\n`;
    response += `**Score:** ${rec.matchScore} | **Status:** ${rec.appetiteStatus}\n\n`;
    response += `${rec.overview}\n\n`;
    response += `**Strengths:** ${rec.strengths.join(', ')}\n`;
    if (rec.considerations.length > 0) {
      response += `**Consider:** ${rec.considerations.join(', ')}\n`;
    }
    response += '\n---\n\n';
  });

  // Add market insights
  if (result.marketInsights) {
    response += `### Market Insights\n${result.marketInsights}\n\n`;
  }

  // Add confidence
  response += `*Confidence: ${(result.confidence * 100).toFixed(0)}% | Rules Applied: ${result.rulesApplied.length}*`;

  return response;
}

/**
 * Format result as JSON for UI consumption
 */
export function formatResultAsJSON(result: InsuranceAgentResult) {
  return {
    request: result.request,
    totalCandidates: result.totalEligibleCarriers,
    escalate: result.escalate,
    escalationReason: result.escalationReason,
    recommendations: result.recommendations,
    excluded: result.exclusions,
    marketInsights: result.marketInsights,
    warnings: result.warnings,
    confidence: result.confidence,
  };
}
