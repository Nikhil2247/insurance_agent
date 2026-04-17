// Database types for Firestore insurance data

export interface CarrierDocument {
  id?: string;
  name: string;
  statesOperatingIn: string;
  knownFor: string;
  type: 'Direct' | 'Wholesaler' | 'Direct via Wholesaler';
  createdAt: Date;
  updatedAt: Date;
}

export interface CoverageTypeDocument {
  id?: string;
  name: string;           // Standardized name (e.g., "Homeowners")
  columnName: string;     // Original CSV column name (e.g., "Home")
  category: string;       // Category (e.g., "Personal Lines", "Specialty")
  description?: string;
}

export interface CarrierAppetiteDocument {
  id?: string;
  carrierId: string;
  carrierName: string;      // Denormalized for faster queries
  coverageType: string;     // Standardized coverage type name
  coverageColumnName: string; // Original CSV column
  hasAppetite: boolean;
  appetiteDetails: string;  // Any specific notes/conditions
  statesOperatingIn: string;
  knownFor: string;
  carrierType: string;
  createdAt: Date;
  updatedAt: Date;
}

// Coverage type mappings from CSV columns to standardized names
export const COVERAGE_TYPE_MAPPINGS: Record<string, { name: string; category: string }> = {
  'Airbnb': { name: 'Short Term Rental', category: 'Specialty' },
  'Auto': { name: 'Auto', category: 'Personal Lines' },
  'Auto Home Combo Policy': { name: 'Auto Home Combo', category: 'Personal Lines' },
  'ATV/UTV': { name: 'ATV/UTV', category: 'Recreational' },
  'Barndominium': { name: 'Barndominium', category: 'Specialty' },
  'Boat': { name: 'Boat', category: 'Recreational' },
  'City Living': { name: 'City Living', category: 'Personal Lines' },
  'Classic Boats': { name: 'Classic Boats', category: 'Recreational' },
  'Collections': { name: 'Collections', category: 'Specialty' },
  'Collector Cars': { name: 'Collector Cars', category: 'Specialty' },
  'Condo': { name: 'Condo', category: 'Personal Lines' },
  'Dwelling Fire': { name: 'Dwelling Fire', category: 'Personal Lines' },
  'Earthquake': { name: 'Earthquake', category: 'Catastrophe' },
  'Earthquake Deductible Buyback': { name: 'Earthquake Deductible Buyback', category: 'Catastrophe' },
  'Equipment Breakdown': { name: 'Equipment Breakdown', category: 'Specialty' },
  'Excess Liability': { name: 'Excess Liability', category: 'Liability' },
  'Flippers': { name: 'Flippers', category: 'Specialty' },
  'Floating Home': { name: 'Floating Home', category: 'Specialty' },
  'Flood': { name: 'Flood', category: 'Catastrophe' },
  'Golf Carts': { name: 'Golf Carts', category: 'Recreational' },
  'High Net Worth Client': { name: 'High Net Worth', category: 'Personal Lines' },
  'Home': { name: 'Homeowners', category: 'Personal Lines' },
  'Home Systems': { name: 'Home Systems', category: 'Specialty' },
  'Home with Old Roofs': { name: 'Old Roof Homes', category: 'Personal Lines' },
  'HO3': { name: 'HO3', category: 'Personal Lines' },
  'Homes with Dangerous Dogs': { name: 'Dangerous Dogs', category: 'Personal Lines' },
  'Homes with Prior Losses': { name: 'Prior Losses', category: 'Personal Lines' },
  'Jewelry Floater': { name: 'Jewelry Floater', category: 'Specialty' },
  'Landlord/DP3': { name: 'Landlord', category: 'Personal Lines' },
  'Log Home': { name: 'Log Home', category: 'Specialty' },
  'Mexico Auto': { name: 'Mexico Auto', category: 'Specialty' },
  'Manufactured Homes': { name: 'Manufactured Home', category: 'Personal Lines' },
  'Motorcycle': { name: 'Motorcycle', category: 'Recreational' },
  'Offsite Storage': { name: 'Offsite Storage', category: 'Specialty' },
  'Packaged Polices Auto & Home': { name: 'Package Policy', category: 'Personal Lines' },
  'Personal Article Floater': { name: 'Personal Article Floater', category: 'Specialty' },
  'Pet Insurance': { name: 'Pet Insurance', category: 'Specialty' },
  'Rental RV, Camper, Trailer, MC': { name: 'Rental RV', category: 'Recreational' },
  'Renters HO4': { name: 'Renters', category: 'Personal Lines' },
  'RV Insurance': { name: 'RV', category: 'Recreational' },
  'Service Line Coverage': { name: 'Service Line', category: 'Specialty' },
  'Snowmobile': { name: 'Snowmobile', category: 'Recreational' },
  'Short Term Rentals': { name: 'Short Term Rental', category: 'Specialty' },
  'Storage Units': { name: 'Storage Units', category: 'Specialty' },
  'Travel ': { name: 'Travel', category: 'Specialty' },
  'Travel Trailer': { name: 'Travel Trailer', category: 'Recreational' },
  'Tiny Homes': { name: 'Tiny Homes', category: 'Specialty' },
  'Uber/Lyft/Ride Sharing': { name: 'Rideshare', category: 'Specialty' },
  'Umbrella': { name: 'Umbrella', category: 'Liability' },
  'VRBO': { name: 'Short Term Rental', category: 'Specialty' },
  'Unoccupied/ Vacant Dwelling': { name: 'Vacant Dwelling', category: 'Specialty' },
  'Yachts': { name: 'Yachts', category: 'Recreational' },
};

// All unique coverage categories
export const COVERAGE_CATEGORIES = [
  'Personal Lines',
  'Liability',
  'Recreational',
  'Specialty',
  'Catastrophe',
] as const;

export type CoverageCategory = typeof COVERAGE_CATEGORIES[number];
