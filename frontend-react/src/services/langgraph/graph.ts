/**
 * LangGraph-style Agent Graph
 * Orchestrates the multi-tool agent workflow for insurance placement
 *
 * Graph Flow:
 * START → parseQuery → [ROUTE BY INTENT]
 *                    ↓ (search)
 *                    carrierSearch → ranking → rulesCheck → generateResponse → END
 *                    ↓ (if no carriers)
 *                    ESCALATE → END
 *                    ↓ (followup)
 *                    carrierDetails → END
 */

import { AgentState, initialState } from './state';
import {
  parseQueryTool,
  carrierSearchTool,
  rankingTool,
  rulesCheckTool,
  generateResponseTool,
  carrierDetailsTool,
} from './tools';

// Node types
type NodeFunction = (state: AgentState) => Partial<AgentState> | Promise<Partial<AgentState>>;

// Graph node definitions
const nodes: Record<string, NodeFunction> = {
  parseQuery: parseQueryTool,
  carrierSearch: carrierSearchTool,
  ranking: rankingTool,
  rulesCheck: rulesCheckTool,
  generateResponse: generateResponseTool,
  carrierDetails: carrierDetailsTool,
};

// Edge definitions (conditional routing)
function getNextNode(currentNode: string, state: AgentState): string | null {
  switch (currentNode) {
    case 'start':
      return 'parseQuery';

    case 'parseQuery':
      // ROUTE BY INTENT
      if (state.queryIntent === 'followup') {
        console.log('[LangGraph] Follow-up detected, routing to carrierDetails');
        return 'carrierDetails';
      }
      return 'carrierSearch';

    case 'carrierSearch':
      // If escalating (no carriers found), skip to generateResponse
      if (state.escalate) {
        return 'generateResponse';
      }
      return 'ranking';

    case 'ranking':
      return 'rulesCheck';

    case 'rulesCheck':
      return 'generateResponse';

    case 'generateResponse':
      return null; // END

    case 'carrierDetails':
      return null; // END

    default:
      return null;
  }
}

// Graph execution engine
export async function runGraph(userQuery: string): Promise<AgentState> {
  // Initialize state
  let state: AgentState = {
    ...initialState,
    userQuery,
    currentStep: 'start',
  };

  console.log('[LangGraph] Starting agent with query:', userQuery);

  let currentNode = 'start';
  const maxIterations = 10; // Safety limit
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Get next node
    const nextNode = getNextNode(currentNode, state);
    if (!nextNode) {
      console.log('[LangGraph] Reached END node');
      break;
    }

    console.log(`[LangGraph] Executing node: ${nextNode}`);

    // Execute node
    const nodeFunction = nodes[nextNode];
    if (!nodeFunction) {
      console.error(`[LangGraph] Unknown node: ${nextNode}`);
      break;
    }

    try {
      const updates = await nodeFunction(state);
      state = { ...state, ...updates };
      console.log(`[LangGraph] Node ${nextNode} complete. State:`, {
        currentStep: state.currentStep,
        escalate: state.escalate,
        queryIntent: state.queryIntent,
        recommendationsCount: state.recommendations.length,
      });
    } catch (error) {
      console.error(`[LangGraph] Error in node ${nextNode}:`, error);
      state = {
        ...state,
        error: `Error in ${nextNode}: ${error}`,
        escalate: true,
        escalationReason: 'System error occurred. Routing to placement desk.',
        currentStep: 'error',
      };
      break;
    }

    currentNode = nextNode;
  }

  if (iterations >= maxIterations) {
    console.warn('[LangGraph] Max iterations reached');
  }

  return state;
}

// Streaming execution (for real-time updates)
export async function* runGraphStreaming(userQuery: string): AsyncGenerator<{
  node: string;
  state: Partial<AgentState>;
}> {
  let state: AgentState = {
    ...initialState,
    userQuery,
    currentStep: 'start',
  };

  let currentNode = 'start';
  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const nextNode = getNextNode(currentNode, state);
    if (!nextNode) break;

    const nodeFunction = nodes[nextNode];
    if (!nodeFunction) break;

    try {
      const updates = await nodeFunction(state);
      state = { ...state, ...updates };

      // Yield progress
      yield {
        node: nextNode,
        state: updates,
      };
    } catch (error) {
      yield {
        node: 'error',
        state: {
          error: `Error in ${nextNode}: ${error}`,
          escalate: true,
        },
      };
      break;
    }

    currentNode = nextNode;
  }
}

// Export types
export type { AgentState };
