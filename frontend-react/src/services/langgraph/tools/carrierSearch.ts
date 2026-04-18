/**
 * Carrier Search Tool - Efficient Data Access
 *
 * Uses indexed data for O(1) lookup by LOB.
 * Only accesses relevant data subset based on query.
 */

import { AgentState } from '../state';
import {
  initializeDataIndex,
  getCarriersForStateAndLob,
  isDataLoaded,
  getIndexStats,
  CarrierAppetiteRecord,
} from '../data/carrierDataIndex';

// Parse states from state string for filtering
function parseStatesFromString(stateStr: string): string[] {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();

  if (upper.includes('ALL STATES') || upper.includes('ALL 50')) {
    return ['ALL'];
  }

  const matches = stateStr.match(/\b[A-Z]{2}\b/g);
  return matches || [];
}

// Check if carrier operates in the specified state
function operatesInState(record: CarrierAppetiteRecord, state: string): boolean {
  if (!state) return true; // No state filter

  const states = parseStatesFromString(record.state_raw);

  // Check for "ALL" or specific state match
  if (states.includes('ALL')) return true;
  if (states.includes(state.toUpperCase())) return true;

  // Also check raw string for state abbreviation
  if (record.state_raw.toUpperCase().includes(state.toUpperCase())) return true;

  return false;
}

export async function carrierSearchTool(state: AgentState): Promise<Partial<AgentState>> {
  try {
    // Initialize data index if not loaded
    if (!isDataLoaded()) {
      console.log('[CarrierSearch] Initializing data index...');
      await initializeDataIndex();
    }

    const stats = getIndexStats();
    console.log(`[CarrierSearch] Data index ready: ${stats.totalCarriers} carriers, ${stats.totalLobs} LOBs`);

    // EFFICIENT: Only query relevant LOB data (uses pre-loaded cached data)
    const targetedRecords = getCarriersForStateAndLob(state.state, state.lob);

    console.log(`[CarrierSearch] Targeted ${targetedRecords.length} records for ${state.lob} in ${state.state}`);

    // Filter for eligible carriers (positive appetite + operates in state)
    const eligibleCarriers = targetedRecords.filter(record => {
      // Must have positive appetite (yes or conditional)
      if (record.appetite_status === 'no') return false;

      // Must operate in the state
      if (!operatesInState(record, state.state)) return false;

      return true;
    });

    console.log(`[CarrierSearch] Found ${eligibleCarriers.length} eligible carriers`);

    // Check if we need to escalate
    const shouldEscalate = eligibleCarriers.length === 0;
    let escalationReason = '';

    if (shouldEscalate) {
      // Check if LOB was not recognized vs no carriers for valid LOB
      const isUnknownLob = !state.lob || state.warnings.some(w => w.includes('Line of business not'));
      if (isUnknownLob) {
        escalationReason = 'Line of business not found. Routing to placement desk for manual handling.';
      } else {
        escalationReason = `No carriers found for ${state.lob} in ${state.state}. Routing to placement desk for manual handling.`;
      }
    }

    return {
      targetedRecords,
      eligibleCarriers,
      allCarriers: eligibleCarriers, // For backward compatibility
      totalEligibleCount: eligibleCarriers.length,
      escalate: shouldEscalate,
      escalationReason,
      currentStep: 'searched',
    };
  } catch (error) {
    console.error('[CarrierSearch] Error:', error);
    return {
      error: `Carrier search failed: ${error}`,
      escalate: true,
      escalationReason: 'System error during carrier search. Routing to placement desk.',
      currentStep: 'error',
    };
  }
}
