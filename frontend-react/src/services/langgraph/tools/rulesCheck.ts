/**
 * Rules Check Tool - Data-Driven Rules Application
 *
 * Applies business rules from the indexed rules dataset:
 * - State eligibility rules
 * - Coverage limits (min/max)
 * - County/metro restrictions
 * - LOB restrictions
 */

import { AgentState, CarrierRecommendation } from '../state';
import { getRulesForCarrierLob, CarrierRule } from '../data/carrierDataIndex';

// Licensed states for CBIG
const CBIG_LICENSED_STATES = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'FL', 'GA', 'IA', 'ID', 'IL', 'IN', 'KS',
  'KY', 'LA', 'MD', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NM',
  'NV', 'OH', 'OK', 'OR', 'PA', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'WA',
  'WI', 'WV', 'WY',
];

// States that require special licensing notes
const SPECIAL_STATES = ['HI', 'AK'];

function normalize(str: string): string {
  return (str || '').toLowerCase().trim();
}

// Parse rule value (handles JSON arrays)
function parseRuleValue(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(v => String(v).toLowerCase());
    return [String(parsed).toLowerCase()];
  } catch {
    return [value.toLowerCase()];
  }
}

// Apply a single rule to a carrier recommendation
function applyRule(
  rule: CarrierRule,
  rec: CarrierRecommendation,
  state: AgentState
): { pass: boolean; warning?: string; penalty?: number } {
  const ruleValues = parseRuleValue(rule.rule_value);

  switch (rule.rule_type) {
    case 'state_eligibility': {
      // Rule specifies which states carrier operates in
      const stateInRule = ruleValues.some(v =>
        v.includes(state.state.toLowerCase()) || v === state.state.toLowerCase()
      );

      if (rule.operator === 'in' && !stateInRule) {
        return {
          pass: false,
          warning: `${rec.carrier} only operates in: ${ruleValues.join(', ').toUpperCase()}`,
        };
      }
      if (rule.operator === 'not_in' && stateInRule) {
        return {
          pass: false,
          warning: `${rec.carrier} does not operate in ${state.state}`,
        };
      }
      return { pass: true };
    }

    case 'state_exclusion': {
      const stateExcluded = ruleValues.some(v =>
        v.includes(state.state.toLowerCase()) || v === state.state.toLowerCase()
      );
      if (stateExcluded) {
        return {
          pass: false,
          warning: `${rec.carrier} excluded in ${state.state}`,
        };
      }
      return { pass: true };
    }

    case 'coverage_max': {
      const maxCoverage = parseInt(rule.rule_value.replace(/[^\d]/g, ''));
      if (state.coverage && state.coverage > maxCoverage) {
        if (rule.severity === 'hard_stop') {
          return {
            pass: false,
            warning: `Coverage $${state.coverage.toLocaleString()} exceeds max $${maxCoverage.toLocaleString()}`,
          };
        }
        return {
          pass: true,
          warning: `Coverage may exceed typical max of $${maxCoverage.toLocaleString()}`,
          penalty: 0.05,
        };
      }
      return { pass: true };
    }

    case 'coverage_min': {
      const minCoverage = parseInt(rule.rule_value.replace(/[^\d]/g, ''));
      if (state.coverage && state.coverage < minCoverage) {
        if (rule.severity === 'hard_stop') {
          return {
            pass: false,
            warning: `Coverage $${state.coverage.toLocaleString()} below minimum $${minCoverage.toLocaleString()}`,
          };
        }
        return {
          pass: true,
          warning: `Coverage below recommended minimum of $${minCoverage.toLocaleString()}`,
          penalty: 0.03,
        };
      }
      return { pass: true };
    }

    case 'county_or_metro_restriction': {
      // DFW, Tier restrictions etc - add warning but don't exclude
      return {
        pass: true,
        warning: `${rec.carrier}: ${rule.source_text}`,
        penalty: 0.02,
      };
    }

    case 'lob_restriction': {
      // Specific LOB restrictions - add warning
      return {
        pass: true,
        warning: rule.source_text || `LOB restriction: ${rule.rule_value}`,
      };
    }

    case 'package_requirement': {
      // Requires bundling with another product
      return {
        pass: true,
        warning: `May require bundling: ${rule.source_text}`,
      };
    }

    default:
      return { pass: true };
  }
}

export function rulesCheckTool(state: AgentState): Partial<AgentState> {
  if (state.escalate) {
    return { currentStep: 'rules_checked' };
  }

  const rulesApplied: string[] = [];
  const exclusions: string[] = [];
  const warnings: string[] = [...state.warnings];
  const appliedRules: CarrierRule[] = [];

  // Check if state is outside CBIG licensed area
  if (state.state && !CBIG_LICENSED_STATES.includes(state.state)) {
    if (SPECIAL_STATES.includes(state.state)) {
      warnings.push(`${state.state} is outside CBIG's licensed states. Verify licensing before submission.`);
    }
  }

  // Get LOB key for rule lookup
  const lobKey = state.lob.toLowerCase();

  // Filter recommendations based on rules
  let filteredRecommendations = state.recommendations.map(rec => {
    const carrierLower = normalize(rec.carrier);
    let modified = { ...rec };
    const recWarnings: string[] = [];
    let totalPenalty = 0;

    // Get rules for this carrier + LOB combination
    const rules = getRulesForCarrierLob(carrierLower, lobKey);

    if (rules.length > 0) {
      console.log(`[RulesCheck] Found ${rules.length} rules for ${rec.carrier} + ${state.lob}`);

      for (const rule of rules) {
        const result = applyRule(rule, rec, state);
        appliedRules.push(rule);

        if (!result.pass) {
          exclusions.push(result.warning || `${rec.carrier} excluded by rule`);
          rulesApplied.push(`${rule.rule_type}: ${rule.source_text}`);
          return null; // Remove this carrier
        }

        if (result.warning) {
          recWarnings.push(result.warning);
        }
        if (result.penalty) {
          totalPenalty += result.penalty;
        }
      }
    }

    // Apply accumulated penalty
    if (totalPenalty > 0) {
      modified.matchScore = Math.max(0.5, modified.matchScore - totalPenalty);
    }

    // Add warnings to considerations
    if (recWarnings.length > 0) {
      modified.considerations = [...modified.considerations, ...recWarnings.slice(0, 2)];
    }

    return modified;
  }).filter((rec): rec is CarrierRecommendation => rec !== null);

  // Re-rank if we removed any carriers
  filteredRecommendations = filteredRecommendations
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((rec, idx) => ({ ...rec, rank: idx + 1 }));

  // If we filtered out all recommendations, add warning
  if (filteredRecommendations.length === 0 && state.eligibleCarriers.length > 0) {
    warnings.push('Primary recommendations excluded by rules. Consider contacting placement desk.');
  }

  // Summarize rules applied
  if (appliedRules.length > 0) {
    rulesApplied.push(`Applied ${appliedRules.length} carrier-specific rules`);
  }
  rulesApplied.push('Checked CBIG licensed states');

  console.log(`[RulesCheck] ${exclusions.length} exclusions, ${warnings.length} warnings`);

  return {
    recommendations: filteredRecommendations.slice(0, 3),
    appliedRules,
    rulesApplied,
    exclusions,
    warnings,
    currentStep: 'rules_checked',
  };
}
