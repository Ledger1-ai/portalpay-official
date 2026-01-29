'use client';

import React, { useState, useMemo } from 'react';
import { getBrandConfig } from '@/config/brands';

interface CompetitorPricing {
  processingFee: number;
  flatFee: number;
  monthlyFee: number;
  annualSoftwareCost: number;
}

interface CostCalculatorProps {
  industry: string;
  defaultVolume?: number;
  competitors: Record<string, CompetitorPricing>;
  className?: string;
}

export function CostCalculator({
  industry,
  defaultVolume = 10000,
  competitors,
  className = '',
}: CostCalculatorProps) {
  const [monthlyVolume, setMonthlyVolume] = useState(defaultVolume);
  const brand = getBrandConfig();

  const calculations = useMemo(() => {
    const results: Record<string, { monthly: number; annual: number; breakdown: string }> = {};

    // PortalPay calculation (0.5-1%, we'll use 0.75% average)
    const basaltsurgeFee = monthlyVolume * 0.0075;
    results.basaltsurge = {
      monthly: basaltsurgeFee,
      annual: basaltsurgeFee * 12,
      breakdown: `${monthlyVolume.toLocaleString()} × 0.75% = $${basaltsurgeFee.toFixed(2)}`,
    };

    // Competitor calculations
    Object.entries(competitors).forEach(([name, pricing]) => {
      const avgTransactionSize = 50; // Assume $50 avg transaction
      const numTransactions = monthlyVolume / avgTransactionSize;

      const processingFees = (monthlyVolume * pricing.processingFee) + (numTransactions * pricing.flatFee);
      const monthlyTotal = processingFees + pricing.monthlyFee;
      const annualTotal = (processingFees * 12) + pricing.annualSoftwareCost;

      results[name] = {
        monthly: monthlyTotal,
        annual: annualTotal,
        breakdown: `${(pricing.processingFee * 100).toFixed(2)}% + $${pricing.flatFee} × ${numTransactions.toFixed(0)} transactions + $${pricing.monthlyFee}/mo`,
      };
    });

    return results;
  }, [monthlyVolume, competitors]);

  const savings = useMemo(() => {
    const competitorNames = Object.keys(competitors);
    if (competitorNames.length === 0) return { monthly: 0, annual: 0, percentage: 0, vs: '' };

    // Calculate average competitor cost
    const avgCompetitorAnnual =
      Object.values(calculations)
        .filter((_, idx) => idx > 0) // Skip basaltsurge
        .reduce((sum, calc) => sum + calc.annual, 0) / competitorNames.length;

    const basaltsurgeAnnual = calculations.basaltsurge.annual;
    const annualSavings = avgCompetitorAnnual - basaltsurgeAnnual;
    const monthlySavings = annualSavings / 12;
    const percentage = (annualSavings / avgCompetitorAnnual) * 100;

    return {
      monthly: monthlySavings,
      annual: annualSavings,
      percentage,
      vs: competitorNames[0],
    };
  }, [calculations, competitors]);

  return (
    <div className={`glass-pane rounded-xl border p-6 ${className}`}>
      <h3 className="text-xl font-semibold mb-4">Calculate Your Savings</h3>

      {/* Volume Slider */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Monthly Processing Volume
        </label>
        <input
          type="range"
          min="1000"
          max="100000"
          step="1000"
          value={monthlyVolume}
          onChange={(e) => setMonthlyVolume(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-muted-foreground mt-1">
          <span>$1k</span>
          <span className="font-semibold text-lg text-foreground">
            ${(monthlyVolume / 1000).toFixed(0)}k/month
          </span>
          <span>$100k</span>
        </div>
      </div>

      {/* Savings Summary */}
      <div className="bg-[var(--pp-secondary)] text-[var(--primary-foreground)] rounded-lg p-4 mb-6">
        <div className="text-sm opacity-90 mb-1">You Save with {brand.name || 'BasaltSurge'}</div>
        <div className="text-3xl font-bold mb-1">
          ${savings.annual.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className="text-lg">/year</span>
        </div>
        <div className="text-sm opacity-90">
          ({savings.percentage.toFixed(0)}% less than competitors)
        </div>
      </div>

      {/* Cost Comparison Table */}
      <div className="space-y-3">
        <div className="text-sm font-semibold mb-2">Monthly Cost Breakdown</div>

        {/* PortalPay Row */}
        <div className="rounded-lg border-2 border-[var(--pp-secondary)] bg-[var(--pp-secondary)]/5 p-3">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-[var(--pp-secondary)]">{brand.name || 'BasaltSurge'}</span>
            <span className="text-lg font-bold text-[var(--pp-secondary)]">
              ${calculations.basaltsurge.monthly.toFixed(2)}/mo
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            0.5-1% processing, $0 monthly fee
          </div>
        </div>

        {/* Competitor Rows */}
        {Object.entries(competitors).map(([name, pricing]) => {
          const calc = calculations[name];
          return (
            <div key={name} className="rounded-lg border p-3 bg-background/50">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium capitalize">
                  {name.replace('-', ' ')}
                </span>
                <span className="text-lg font-semibold">
                  ${calc.monthly.toFixed(2)}/mo
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {(pricing.processingFee * 100).toFixed(2)}% + ${pricing.flatFee} per transaction
                {pricing.monthlyFee > 0 && ` + $${pricing.monthlyFee}/mo`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Annual Comparison */}
      <div className="mt-6 pt-6 border-t">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">Annual with {brand.name || 'BasaltSurge'}</div>
            <div className="text-xl font-bold text-[var(--pp-secondary)]">
              ${calculations.basaltsurge.annual.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Annual with Others</div>
            <div className="text-xl font-bold line-through opacity-50">
              ${(calculations.basaltsurge.annual + savings.annual).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-6">
        <a
          href="/admin"
          className="block w-full text-center px-6 py-3 rounded-md bg-[var(--pp-secondary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90 transition"
        >
          Start Saving Today
        </a>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        Calculations based on industry averages. Actual savings may vary.
      </p>
    </div>
  );
}
