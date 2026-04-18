/**
 * Generate Response Tool
 * Creates the final response with AI-enhanced market insights
 */

import { AgentState } from '../state';
import { generateAIMarketInsights } from './aiProcessor';

export async function generateResponseTool(state: AgentState): Promise<Partial<AgentState>> {
  // If escalating, return escalation message
  if (state.escalate) {
    return {
      marketInsights: state.escalationReason || 'Routing to placement desk for manual handling.',
      currentStep: 'complete',
    };
  }

  // Prepare context for AI processing
  const aiContext = {
    state: state.state,
    lob: state.lob,
    coverage: state.coverage,
    totalEligible: state.totalEligibleCount,
    carriers: state.recommendations.map(rec => ({
      carrier: rec.carrier,
      matchScore: rec.matchScore,
      appetiteStatus: rec.appetiteStatus,
      knownFor: rec.overview,
      states: rec.stateAnalysis.details,
      strengths: rec.strengths,
      considerations: rec.considerations,
    })),
  };

  // Generate AI-enhanced market insights
  let marketInsights = '';
  try {
    marketInsights = await generateAIMarketInsights(aiContext);
  } catch (error) {
    console.error('[GenerateResponse] AI processing failed, using fallback:', error);
    marketInsights = generateFallbackInsights(state);
  }

  // Add warnings if any
  if (state.warnings.length > 0) {
    marketInsights += `\n\n**Note:** ${state.warnings[0]}`;
  }

  return {
    marketInsights,
    currentStep: 'complete',
  };
}

function generateFallbackInsights(state: AgentState): string {
  if (state.recommendations.length === 0) {
    return `Limited carrier options found for ${state.lob} in ${state.state}. Consider E&S markets or contact placement desk.`;
  }

  const directCount = state.recommendations.filter(r =>
    !r.considerations.some(c => c.toLowerCase().includes('wholesaler'))
  ).length;

  let insights = `The **${state.state}** ${state.lob} market has `;

  if (directCount === state.recommendations.length) {
    insights += 'strong direct market options';
  } else if (directCount > 0) {
    insights += 'both direct and wholesale options available';
  } else {
    insights += 'wholesale/E&S capacity available';
  }

  insights += ` with ${state.totalEligibleCount} eligible carriers. `;

  if (state.coverage) {
    if (state.coverage >= 1000000) {
      insights += `For high-value coverage of **$${(state.coverage / 1000000).toFixed(1)}M**, consider carriers specializing in affluent markets.`;
    } else {
      insights += `**$${state.coverage.toLocaleString()}** coverage is well within standard market appetite.`;
    }
  }

  return insights;
}
