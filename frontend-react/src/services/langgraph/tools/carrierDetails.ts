/**
 * Carrier Details Tool
 * Generates AI-enhanced detailed information for a selected carrier
 */

import { AgentState } from '../state';
import { getCarrierAppetites, CarrierAppetiteRecord, AGENCY_CONTACT } from '../data/carrierDataIndex';
import { generateAICarrierDetails } from './aiProcessor';

export async function carrierDetailsTool(state: AgentState): Promise<Partial<AgentState>> {
  // Extract selected carrier from messages
  const selectedCarrierMsg = state.messages.find(m =>
    m.content.startsWith('SELECTED_CARRIER:')
  );

  if (!selectedCarrierMsg) {
    return {
      escalate: true,
      escalationReason: 'No carrier selected. Please select a carrier from the recommendations.',
      currentStep: 'complete',
    };
  }

  const selectedCarrier = selectedCarrierMsg.content.replace('SELECTED_CARRIER:', '').trim();
  console.log(`[CarrierDetails] Generating AI-enhanced details for: ${selectedCarrier}`);

  // Find carrier in our data
  const carrierKey = selectedCarrier.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  let carrierAppetites = getCarrierAppetites(carrierKey);

  // Try partial matching if no exact match
  if (carrierAppetites.length === 0) {
    // Try matching by first word
    const firstWord = carrierKey.split(' ')[0];
    carrierAppetites = getCarrierAppetites(firstWord);
  }

  // Get carrier data
  const carrierData: CarrierAppetiteRecord | null = carrierAppetites.length > 0 ? carrierAppetites[0] : null;

  // Prepare data for AI processing
  const carrierInfo = carrierData ? {
    knownFor: carrierData.known_for,
    states: carrierData.state_raw,
    appetite: carrierData.appetite_raw,
    lob: carrierData.lob_raw,
  } : null;

  // Generate AI-enhanced detailed response
  let marketInsights = '';
  try {
    marketInsights = await generateAICarrierDetails(
      carrierData?.carrier_raw || selectedCarrier,
      carrierInfo,
      {
        state: state.state,
        lob: state.lob,
        coverage: state.coverage,
      }
    );
  } catch (error) {
    console.error('[CarrierDetails] AI processing failed, using fallback:', error);
    marketInsights = buildFallbackDetails(selectedCarrier, carrierData);
  }

  return {
    marketInsights,
    currentStep: 'complete',
  };
}

function buildFallbackDetails(carrierName: string, data: CarrierAppetiteRecord | null): string {
  if (!data) {
    return `## ${carrierName} - Placement Summary

### Overview
${carrierName} has been selected for this placement based on your requirements.

### Key Information
| Attribute | Details |
|-----------|---------|
| Carrier | ${carrierName} |
| Type | Direct Carrier |
| Status | Active |

### Coverage & Requirements
- **Standard Requirements:** Property inspection may be required
- **Documentation:** Prior claims history, property details
- **Pricing:** Competitive rates for qualifying risks

### Next Steps
1. **Submit Application** - Complete the standard submission form
2. **Required Documents** - Provide property details, prior claims history, photos if needed
3. **Expected Timeline** - Quote typically within 24-48 hours

### Contact Information
| | |
|---|---|
| **Agency** | ${AGENCY_CONTACT.name} |
| **Placement Desk** | ${AGENCY_CONTACT.placementDesk} |
| **Email** | ${AGENCY_CONTACT.email} |

---
*Ready to submit? Contact the placement desk to proceed.*`;
  }

  const stateInfo = data.state_raw || 'Multiple states';
  const knownFor = data.known_for || 'Various coverage types';
  const appetiteStatus = data.appetite_status === 'yes' ? 'Strong Appetite' :
                         data.appetite_status === 'conditional' ? 'Conditional' : 'Limited';
  const carrierType = data.carrier_type || 'Direct';

  return `## ${data.carrier_raw} - Placement Summary

### Overview
${data.carrier_raw} is a strong choice for this placement. ${knownFor ? `Known for: ${knownFor}.` : ''}

### Key Information
| Attribute | Details |
|-----------|---------|
| Carrier | ${data.carrier_raw} |
| Type | ${carrierType} |
| States | ${stateInfo.length > 60 ? stateInfo.substring(0, 60) + '...' : stateInfo} |
| Known For | ${knownFor} |
| Appetite | ${appetiteStatus} |
| Segment | ${data.segment ? data.segment.charAt(0).toUpperCase() + data.segment.slice(1) : 'Personal'} |

### Coverage Details
${data.lob_raw ? `- **Line of Business:** ${data.lob_raw}` : ''}
${data.appetite_raw ? `- **Appetite Notes:** ${data.appetite_raw}` : ''}
${carrierType === 'Wholesaler' ? '- **Note:** Wholesaler fees may apply' : ''}
${data.needs_review ? '- **Note:** May require manual review for certain conditions' : ''}

### Underwriting Requirements
- Standard property inspection for values over $500K
- Prior claims history (5 years)
- Photos of property condition
- Proof of protective devices for credits

### Pricing Expectations
- Competitive base rates
- Multi-policy discounts available
- Claims-free discounts for 3+ years

### Next Steps
1. **Submit Application** - Use the standard submission portal
2. **Required Documents:**
   - Completed ACORD application
   - Property photos
   - Prior policy declarations
   - Claims history
3. **Expected Timeline** - Initial quote within 24-48 hours

### Contact Information
| | |
|---|---|
| **Agency** | ${AGENCY_CONTACT.name} |
| **Placement Desk** | ${AGENCY_CONTACT.placementDesk} |
| **Email** | ${AGENCY_CONTACT.email} |

---
*Ready to submit? Contact the placement desk to proceed.*`;
}
