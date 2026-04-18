/**
 * LangGraph Insurance Placement Agent
 *
 * A multi-tool agent system for intelligent carrier recommendations.
 *
 * Usage:
 *   import { runInsuranceAgent, InsuranceAgentResult } from './langgraph';
 *
 *   const result = await runInsuranceAgent("I need home insurance in TX for $400,000");
 *   console.log(result.recommendations);
 */

import { runGraph, runGraphStreaming, AgentState } from './graph';
import { initializeDataIndex, getIndexStats, isDataLoaded, getDataSource } from './data/carrierDataIndex';

export interface InsuranceAgentResult {
  success: boolean;
  escalate: boolean;
  escalationReason?: string;

  // Query intent: 'search' for new searches, 'followup' for carrier details
  queryIntent: 'search' | 'followup' | 'general';

  // Request info
  request: {
    state: string;
    lob: string;
    coverage: number;
  };

  // Results
  totalEligibleCarriers: number;
  recommendations: Array<{
    rank: number;
    carrier: string;
    matchScore: number;
    appetiteStatus: string;
    overview: string;
    stateAnalysis: { eligible: boolean; details: string };
    coverageAnalysis: { acceptable: boolean; details: string };
    underwritingNotes: string;
    strengths: string[];
    considerations: string[];
    recommendation: string;
  }>;

  // Metadata
  confidence: number;
  warnings: string[];
  rulesApplied: string[];
  exclusions: string[];
  marketInsights: string;

  // Debug
  error?: string;
}

/**
 * Run the insurance placement agent
 * @param query - User's natural language query
 * @returns Promise<InsuranceAgentResult>
 */
export async function runInsuranceAgent(query: string): Promise<InsuranceAgentResult> {
  console.log('[InsuranceAgent] Processing query:', query);

  const state = await runGraph(query);

  return formatResult(state);
}

/**
 * Run the agent with streaming updates
 * @param query - User's natural language query
 * @yields Progress updates as the agent executes each step
 */
export async function* runInsuranceAgentStreaming(query: string): AsyncGenerator<{
  step: string;
  progress: number;
  message: string;
  partialResult?: Partial<InsuranceAgentResult>;
}> {
  const steps = ['parseQuery', 'carrierSearch', 'ranking', 'rulesCheck', 'generateResponse'];
  let stepIndex = 0;

  for await (const update of runGraphStreaming(query)) {
    stepIndex = steps.indexOf(update.node) + 1;
    const progress = (stepIndex / steps.length) * 100;

    yield {
      step: update.node,
      progress,
      message: getStepMessage(update.node),
      partialResult: update.state as Partial<InsuranceAgentResult>,
    };
  }
}

function formatResult(state: AgentState): InsuranceAgentResult {
  return {
    success: !state.error,
    escalate: state.escalate,
    escalationReason: state.escalationReason || undefined,
    queryIntent: state.queryIntent,

    request: {
      state: state.state,
      lob: state.lob,
      coverage: state.coverage,
    },

    totalEligibleCarriers: state.totalEligibleCount,
    recommendations: state.recommendations,

    confidence: state.confidence,
    warnings: state.warnings,
    rulesApplied: state.rulesApplied,
    exclusions: state.exclusions,
    marketInsights: state.marketInsights,

    error: state.error || undefined,
  };
}

function getStepMessage(step: string): string {
  switch (step) {
    case 'parseQuery':
      return 'Analyzing your request...';
    case 'carrierSearch':
      return 'Searching eligible carriers...';
    case 'ranking':
      return 'Ranking carriers by fit...';
    case 'rulesCheck':
      return 'Applying business rules...';
    case 'generateResponse':
      return 'Generating recommendations...';
    default:
      return 'Processing...';
  }
}

/**
 * Initialize the data index
 * Should be called before first query for faster response
 */
export async function initializeLangGraphAgent(): Promise<{
  ready: boolean;
  stats?: {
    totalCarriers: number;
    totalLobs: number;
    totalRules: number;
    dataSource: 'firebase' | 'none';
  };
}> {
  try {
    if (!isDataLoaded()) {
      await initializeDataIndex();
    }
    const stats = getIndexStats();
    const dataSource = getDataSource();
    console.log('[LangGraph] Agent initialized:', stats, 'Source:', dataSource);
    return {
      ready: true,
      stats: {
        totalCarriers: stats.totalCarriers,
        totalLobs: stats.totalLobs,
        totalRules: stats.totalRules,
        dataSource: dataSource,
      },
    };
  } catch (error) {
    console.error('[LangGraph] Initialization error:', error);
    return { ready: false };
  }
}

// Export types and utilities
export type { AgentState };
export { getIndexStats, isDataLoaded };
