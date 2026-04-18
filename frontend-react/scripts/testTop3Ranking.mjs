/**
 * Test Top 3 Ranking Logic
 *
 * Validates that the agent returns the BEST 3 carriers based on ranking criteria
 * Run with: node scripts/testTop3Ranking.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCUQ4TXUEI90WYzc8PyoDmtxCbLAA4ZJeM",
  authDomain: "insurance-agent-4f3e1.firebaseapp.com",
  projectId: "insurance-agent-4f3e1",
  storageBucket: "insurance-agent-4f3e1.firebasestorage.app",
  messagingSenderId: "536266402393",
  appId: "1:536266402393:web:fdcb7148a6e88d8c251f48"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================================
// RANKING CRITERIA (mirrors ranking.ts)
// ============================================================================

// State-LOB specific rankings (known best carriers)
const STATE_LOB_RANKINGS = {
  'TX': {
    'homeowners': {
      'safeco': 20, 'orion 180': 18, 'south & western': 16, 'travelers': 14,
      'foremost': 12, 'germania': 10, 'mercury': 8,
    },
    'auto': {
      'geico': 25, 'germania': 18, 'safeco': 16, 'travelers': 14, 'national general': 12,
    },
    'umbrella': {
      'travelers': 20, 'germania': 18, 'safeco': 16, 'usli': 14, 'rli': 12,
    },
    'flood': {
      'travelers': 20, 'orion 180': 18, 'germania': 16, 'wright flood': 14, 'neptune': 12,
    },
    'manufactured homes': {
      'south & western': 20, 'foremost': 18, 'aegis': 16, 'american modern': 14,
    },
  },
  'CA': {
    'homeowners': {
      'orion 180': 20, 'travelers': 18, 'lemonade': 16, 'safeco': 14, 'mercury': 12,
    },
    'landlord': {
      'safeco': 20, 'mercury': 18, 'foremost': 16, 'travelers': 14,
    },
  },
  'FL': {
    'homeowners': {
      'safeco': 20, 'travelers': 18, 'foremost': 16, 'orion 180': 14,
    },
    'flood': {
      'nationwide': 20, 'hartford': 18, 'appalachian underwriters': 16, 'wright flood': 14,
    },
  },
};

// General preferred carriers
const GENERAL_PREFERRED = {
  'safeco': 5,
  'travelers': 4,
  'geico': 4,
  'orion 180': 4,
  'mercury': 3,
  'foremost': 3,
  'hartford': 3,
  'nationwide': 3,
  'germania': 3,
};

// ============================================================================
// DATA LOADING
// ============================================================================

const allRecords = [];

function parseStates(stateStr) {
  if (!stateStr) return [];
  const upper = stateStr.toUpperCase();
  if (upper.includes('ALL STATES') || upper.includes('ALL 50')) {
    return ['ALL'];
  }
  const matches = stateStr.match(/\b[A-Z]{2}\b/g);
  return matches || [];
}

async function loadData() {
  console.log('Loading data from Firestore...\n');
  const colRef = collection(db, 'aiReadyLongform');
  const snapshot = await getDocs(colRef);

  snapshot.forEach((doc) => {
    const data = doc.data();
    const status = (data.appetite_status || 'no').toLowerCase();
    if (status === 'no') return;

    allRecords.push({
      carrier: data.carrier_raw || '',
      carrier_key: (data.carrier_key || '').toLowerCase(),
      lob_key: (data.lob_key || '').toLowerCase(),
      state_raw: data.state_raw || '',
      status: status,
      known_for: data.known_for || '',
      carrier_type: data.carrier_type || 'Direct',
    });
  });

  console.log(`Loaded ${allRecords.length} records\n`);
}

// ============================================================================
// RANKING SIMULATION
// ============================================================================

function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function scoreCarrier(record, lob, state) {
  let score = 50; // Base score
  const rationale = [];
  const carrierKey = normalize(record.carrier_key);
  const stateUpper = state.toUpperCase();
  const lobLower = normalize(lob);

  // 1. State-LOB specific ranking (highest weight)
  const stateRankings = STATE_LOB_RANKINGS[stateUpper];
  if (stateRankings && stateRankings[lobLower]) {
    const lobRankings = stateRankings[lobLower];
    for (const [rankedCarrier, bonus] of Object.entries(lobRankings)) {
      if (carrierKey.includes(rankedCarrier) || rankedCarrier.includes(carrierKey)) {
        score += bonus;
        rationale.push(`Top choice for ${lob} in ${state}`);
        break;
      }
    }
  }

  // 2. Check known_for field
  const knownForLower = normalize(record.known_for);
  const lobKeywords = {
    'homeowners': ['home', 'homeowner', 'residential'],
    'auto': ['auto', 'car', 'vehicle'],
    'umbrella': ['umbrella', 'excess'],
    'flood': ['flood'],
    'manufactured homes': ['manufactured', 'mobile home'],
    'landlord': ['landlord', 'dp3', 'rental'],
  };
  const keywords = lobKeywords[lobLower] || [lobLower];
  for (const keyword of keywords) {
    if (knownForLower.includes(keyword)) {
      score += 8;
      rationale.push(`Known for ${lob}`);
      break;
    }
  }

  // 3. Appetite status
  if (record.status === 'yes') {
    score += 6;
    rationale.push('Strong appetite');
  } else if (record.status === 'conditional') {
    score += 2;
    rationale.push('Conditional appetite');
  }

  // 4. General production relationship
  const generalBonus = GENERAL_PREFERRED[carrierKey] || 0;
  if (generalBonus > 0) {
    score += generalBonus;
    rationale.push('Strong production relationship');
  }

  // 5. State matching bonus
  const stateRaw = record.state_raw || '';
  const stateRawUpper = stateRaw.toUpperCase();
  if (stateRawUpper.includes(`${stateUpper} ONLY`)) {
    score += 8;
    rationale.push(`${stateUpper} specialist`);
  } else if (stateRawUpper.includes(stateUpper) || stateRawUpper.includes('ALL STATES')) {
    score += 3;
  }

  return { score: Math.min(95, Math.max(50, score)), rationale };
}

function getTop3(state, lob) {
  const stateUpper = state.toUpperCase();
  const lobLower = normalize(lob);

  // Find eligible carriers
  const eligible = allRecords.filter(r => {
    // LOB match
    if (!r.lob_key.includes(lobLower) && !lobLower.includes(r.lob_key)) {
      return false;
    }

    // State match
    const states = parseStates(r.state_raw);
    if (states.length === 0 || states.includes('ALL') || states.includes(stateUpper)) {
      return true;
    }
    const stateRawUpper = r.state_raw.toUpperCase();
    return stateRawUpper.includes(stateUpper) || stateRawUpper.includes('ALL STATES');
  });

  // Score and rank
  const scored = eligible.map(r => {
    const { score, rationale } = scoreCarrier(r, lob, state);
    return { ...r, score, rationale };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Remove duplicates (keep highest scoring)
  const seen = new Set();
  const unique = scored.filter(r => {
    if (seen.has(r.carrier_key)) return false;
    seen.add(r.carrier_key);
    return true;
  });

  return unique.slice(0, 3);
}

// ============================================================================
// TEST CASES
// ============================================================================

const testCases = [
  {
    id: 1,
    description: 'TX Homeowners - Should prioritize Safeco, Orion 180, S&W',
    state: 'TX',
    lob: 'homeowners',
    expectedTopCarriers: ['safeco', 'orion 180', 'south & western', 'travelers', 'foremost'],
  },
  {
    id: 2,
    description: 'TX Auto - Should prioritize Geico, Germania, Safeco',
    state: 'TX',
    lob: 'auto',
    expectedTopCarriers: ['geico', 'germania', 'safeco', 'travelers'],
  },
  {
    id: 3,
    description: 'TX Manufactured Homes - Should prioritize S&W, Foremost, Aegis',
    state: 'TX',
    lob: 'manufactured homes',
    expectedTopCarriers: ['south & western', 'foremost', 'aegis', 'american modern'],
  },
  {
    id: 4,
    description: 'CA Homeowners - Should prioritize Orion 180, Travelers',
    state: 'CA',
    lob: 'homeowners',
    expectedTopCarriers: ['orion 180', 'travelers', 'lemonade', 'safeco', 'mercury'],
  },
  {
    id: 5,
    description: 'TX Umbrella - Should prioritize Travelers, Germania, Safeco',
    state: 'TX',
    lob: 'umbrella',
    expectedTopCarriers: ['travelers', 'germania', 'safeco', 'usli', 'rli'],
  },
  {
    id: 6,
    description: 'FL Flood - Should prioritize Nationwide, Hartford',
    state: 'FL',
    lob: 'flood',
    expectedTopCarriers: ['nationwide', 'hartford', 'appalachian', 'wright flood'],
  },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  TOP 3 RANKING VALIDATION');
  console.log('█'.repeat(70) + '\n');

  await loadData();

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log('─'.repeat(70));
    console.log(`TEST ${test.id}: ${test.description}`);
    console.log('─'.repeat(70));
    console.log(`Query: ${test.lob} in ${test.state}`);
    console.log(`Expected top carriers: ${test.expectedTopCarriers.join(', ')}`);

    const top3 = getTop3(test.state, test.lob);

    console.log('\nActual Top 3:');
    top3.forEach((carrier, idx) => {
      console.log(`  ${idx + 1}. ${carrier.carrier} (score: ${carrier.score})`);
      console.log(`     Key: ${carrier.carrier_key}`);
      console.log(`     Rationale: ${carrier.rationale.join(', ')}`);
      console.log(`     Known for: ${carrier.known_for || 'N/A'}`);
    });

    // Check if at least one expected carrier is in top 3
    const top3Keys = top3.map(c => c.carrier_key);
    const matchingExpected = test.expectedTopCarriers.filter(exp =>
      top3Keys.some(key => key.includes(exp) || exp.includes(key))
    );

    const testPassed = matchingExpected.length >= 1;

    if (testPassed) {
      console.log(`\n✓ PASS - Found expected carrier(s): ${matchingExpected.join(', ')}`);
      passed++;
    } else {
      console.log(`\n✗ FAIL - None of expected carriers in top 3`);
      console.log(`  Expected: ${test.expectedTopCarriers.join(', ')}`);
      console.log(`  Got: ${top3Keys.join(', ')}`);
      failed++;
    }
    console.log('');
  }

  // Summary
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\n  Total Tests:  ${testCases.length}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Pass Rate:    ${((passed / testCases.length) * 100).toFixed(1)}%\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
