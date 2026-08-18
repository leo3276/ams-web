// Ghana income tax calculation for AMS's Tax Preparation feature.
//
// Sources (current as of mid-2026, referencing GRA-published figures):
// - Corporate (company) income tax: flat 25% on chargeable income
// - Resident individual / sole proprietorship: progressive annual bands

export const GHANA_CORPORATE_RATE = 0.25;

export const GHANA_INDIVIDUAL_BANDS: { amount: number | null; rate: number; label: string }[] = [
  { amount: 5_880, rate: 0, label: 'First GHS 5,880 (0%)' },
  { amount: 1_200, rate: 0.05, label: 'Next GHS 1,200 (5%)' },
  { amount: 6_000, rate: 0.10, label: 'Next GHS 6,000 (10%)' },
  { amount: 24_000, rate: 0.175, label: 'Next GHS 24,000 (17.5%)' },
  { amount: 24_000, rate: 0.25, label: 'Next GHS 24,000 (25%)' },
  { amount: 178_920, rate: 0.30, label: 'Next GHS 178,920 (30%)' },
  { amount: null, rate: 0.35, label: 'Exceeding GHS 240,000 (35%)' },
];

export type BusinessType = 'corporate' | 'sole_proprietorship';

export interface TaxEstimate {
  taxableIncome: number;
  estimatedTax: number;
  effectiveRate: number; // estimatedTax / taxableIncome
  bracketBreakdown: { label: string; slice: number; rate: number; tax: number }[];
}

function calculateProgressiveTax(taxableIncome: number): { tax: number; breakdown: { label: string; slice: number; rate: number; tax: number }[] } {
  if (taxableIncome <= 0) return { tax: 0, breakdown: [] };

  let remaining = taxableIncome;
  let totalTax = 0;
  const breakdown: { label: string; slice: number; rate: number; tax: number }[] = [];

  for (const band of GHANA_INDIVIDUAL_BANDS) {
    if (remaining <= 0) break;
    const slice = band.amount == null ? remaining : Math.min(remaining, band.amount);
    const bandTax = slice * band.rate;
    totalTax += bandTax;
    breakdown.push({
      label: band.label,
      slice,
      rate: band.rate,
      tax: bandTax,
    });
    remaining -= slice;
  }

  return { tax: totalTax, breakdown };
}

export function estimateGhanaTax(taxableIncome: number, businessType: BusinessType): TaxEstimate {
  if (taxableIncome <= 0) {
    return { taxableIncome, estimatedTax: 0, effectiveRate: 0, bracketBreakdown: [] };
  }

  if (businessType === 'corporate') {
    const estimatedTax = taxableIncome * GHANA_CORPORATE_RATE;
    return {
      taxableIncome,
      estimatedTax,
      effectiveRate: GHANA_CORPORATE_RATE,
      bracketBreakdown: [
        {
          label: 'Corporate Flat Rate (25%)',
          slice: taxableIncome,
          rate: GHANA_CORPORATE_RATE,
          tax: estimatedTax,
        },
      ],
    };
  }

  const { tax, breakdown } = calculateProgressiveTax(taxableIncome);

  return {
    taxableIncome,
    estimatedTax: tax,
    effectiveRate: tax / taxableIncome,
    bracketBreakdown: breakdown,
  };
}
