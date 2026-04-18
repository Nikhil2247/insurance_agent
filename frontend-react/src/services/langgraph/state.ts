/**
 * LangGraph Agent State Definition
 *
 * Defines the state that flows through the agent graph.
 * Each tool reads from and writes to this state.
 */

import { CarrierAppetiteRecord, CarrierRule } from './data/carrierDataIndex';

export interface CarrierRecommendation {
  rank: number;
  carrier: string;
  matchScore: number; // 0.50 - 0.95 range
  appetiteStatus: string;
  overview: string;
  stateAnalysis: {
    eligible: boolean;
    details: string;
  };
  coverageAnalysis: {
    acceptable: boolean;
    details: string;
  };
  underwritingNotes: string;
  strengths: string[];
  considerations: string[];
  recommendation: string;
}

export interface AgentState {
  // Input
  userQuery: string;

  // Parsed query (from parseQuery tool)
  state: string;        // e.g., "TX"
  lob: string;          // e.g., "Homeowners"
  lobKeys: string[];    // Normalized LOB keys for data lookup
  coverage: number;     // e.g., 400000
  queryIntent: 'search' | 'followup' | 'general';
  riskFactors: string[];  // AI-detected risk factors (e.g., "high-value", "coastal")

  // Carrier data (from carrierSearch tool) - TARGETED records only
  targetedRecords: CarrierAppetiteRecord[];  // Only relevant records for this LOB
  eligibleCarriers: CarrierAppetiteRecord[]; // Filtered by state/appetite
  totalEligibleCount: number;

  // For backward compatibility
  allCarriers: CarrierAppetiteRecord[];

  // Ranked results (from ranking tool)
  rankedCarriers: CarrierRecommendation[];

  // Rules applied (from rulesCheck tool)
  appliedRules: CarrierRule[];
  rulesApplied: string[];
  exclusions: string[];
  warnings: string[];

  // Final recommendations
  recommendations: CarrierRecommendation[];
  marketInsights: string;

  // Control flow
  escalate: boolean;
  escalationReason: string;
  confidence: number;
  currentStep: string;
  error: string | null;
  messages: Array<{ role: string; content: string }>;
}

export const initialState: AgentState = {
  userQuery: '',
  state: '',
  lob: '',
  lobKeys: [],
  coverage: 0,
  queryIntent: 'search',
  riskFactors: [],

  targetedRecords: [],
  eligibleCarriers: [],
  totalEligibleCount: 0,
  allCarriers: [],

  rankedCarriers: [],

  appliedRules: [],
  rulesApplied: [],
  exclusions: [],
  warnings: [],

  recommendations: [],
  marketInsights: '',

  escalate: false,
  escalationReason: '',
  confidence: 0,
  currentStep: 'start',
  error: null,
  messages: [],
};
