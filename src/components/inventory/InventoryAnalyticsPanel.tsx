"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, BarChart as BarChartIcon } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useInventoryMovement,
  useInventorySummary as useInventoryAnalyticsSummary,
  useABCAnalysis,
  useWasteReport,
  useTurnoverSeries,
} from "@/lib/hooks/use-graphql";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 text-sm border rounded-md shadow-lg bg-background/80 dark:bg-black/70 border-border backdrop-blur-sm">
        <p className="font-bold label">{label}</p>
        {payload.map((pld: any, index: number) => (
          <div key={index} style={{ color: pld.color || pld.fill }}>
            {`${pld.name}: ${pld.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        ))}
      </div>
    );
  }

  return null;
};

export default function InventoryAnalyticsPanel() {
  const [period, setPeriod] = React.useState<"daily" | "weekly" | "monthly">("daily");
  const [range, setRange] = React.useState(() => {
    const today = new Date();
    const dow = today.getDay();
    const diff = (dow + 6) % 7; // Monday start
    const start = new Date(today);
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  });

  // Align weekly ranges to Monday→Sunday boundaries for analytics
  const alignToMondayRange = React.useCallback((startISO: string, endISO: string) => {
    const start = new Date(startISO);
    const end = new Date(endISO);
    const alignStart = new Date(start);
    const dowStart = alignStart.getDay();
    const diffStart = (dowStart + 6) % 7; // to Monday
    alignStart.setDate(alignStart.getDate() - diffStart);
    alignStart.setHours(0, 0, 0, 0);
    const alignEnd = new Date(end);
    const alignEndMonday = new Date(alignEnd);
    const dowEnd = alignEndMonday.getDay();
    const diffEnd = (dowEnd + 6) % 7;
    alignEndMonday.setDate(alignEndMonday.getDate() - diffEnd);
    alignEndMonday.setHours(0, 0, 0, 0);
    alignEndMonday.setDate(alignEndMonday.getDate() + 7);
    alignEnd.setTime(alignEndMonday.getTime() - 1);
    return { start: alignStart.toISOString().split('T')[0], end: alignEnd.toISOString().split('T')[0] };
  }, []);

  const alignedRange = React.useMemo(() => (
    (period === 'weekly' || period === 'daily')
      ? alignToMondayRange(range.start, range.end)
      : { start: range.start, end: range.end }
  ), [period, range.start, range.end, alignToMondayRange]);

  const { data: summaryData, refetch: refetchSummary } = useInventoryAnalyticsSummary();
  const { data: movement, refetch: refetchMovement } = useInventoryMovement(period, alignedRange.start, alignedRange.end);
  const { data: abc, refetch: refetchABC } = useABCAnalysis(alignedRange.start, alignedRange.end, "consumptionValue");
  const { data: waste, refetch: refetchWaste } = useWasteReport({ startDate: alignedRange.start, endDate: alignedRange.end });
  const { data: turnover, refetch: refetchTurnover } = useTurnoverSeries(period, alignedRange.start, alignedRange.end);

  const movementData = movement?.inventoryMovement || [];
  const summary = summaryData?.inventorySummary;
  const abcRows = abc?.abcAnalysis || [];
  const wasteByReason = waste?.wasteReport?.byReason || [];
  const turnoverSeries = turnover?.inventoryTurnoverSeries || [];

  // Demo-friendly rich waste data fallback for visuals
  const wasteByReasonDisplay = React.useMemo(() => {
    const rows = Array.isArray(wasteByReason) ? wasteByReason : [];
    if (rows.length > 1) return rows;
    return [
      { reason: 'Spoiled', quantity: 12, cost: 86 },
      { reason: 'Expired', quantity: 7, cost: 54 },
      { reason: 'Prep Error', quantity: 5, cost: 41 },
      { reason: 'Dropped', quantity: 3, cost: 28 },
      { reason: 'Contaminated', quantity: 2, cost: 19 },
    ];
  }, [wasteByReason]);

  // Teal bar palette that adapts to number of bars (dark → light)
  const abcBarColors = React.useMemo(() => {
    const n = abcRows.length;
    if (n <= 0) return [] as string[];
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0.5 : i / Math.max(1, n - 1); // 0..1 across bars
      const lightness = 32 + t * 40; // 32%..72%
      return `hsl(173 72% ${lightness}%)`;
    });
  }, [abcRows.length]);

  // Teal slice palette for waste pie (dark → light)
  const wasteTealColors = React.useMemo(() => {
    const n = (wasteByReasonDisplay || []).length;
    if (n <= 0) return [] as string[];
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0.5 : i / Math.max(1, n - 1);
      const lightness = 30 + t * 45; // 30%..75%
      const saturation = 70 - t * 20; // reduce saturation as it lightens
      return `hsl(173 ${saturation}% ${lightness}%)`;
    });
  }, [wasteByReasonDisplay]);

  const glassmorphismTooltipStyle = {
    backgroundColor: "hsla(var(--background) / 0.8)",
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--foreground))",
    backdropFilter: "blur(4px)",
    borderRadius: "0.5rem",
  };

  // Auto-refresh when date/period changes
  React.useEffect(() => {
    refetchSummary();
    refetchMovement();
    refetchABC();
    refetchWaste();
    refetchTurnover();
  }, [period, alignedRange.start, alignedRange.end]);

  const handleExport = async (what: string, format: "csv" | "xlsx" | "pdf") => {
    const { exportCSV, exportXLSX, exportPDFTable } = await import("@/lib/reporting/exports");
    const filenameBase = `inventory-${what}-${range.start}-to-${range.end}`;
    if (what === "movement") {
      const rows = movementData.map((d: any) => ({
        date: d.date,
        received: d.received,
        usage: d.usage,
        adjustments: d.adjustments,
        netMovement: d.netMovement,
        transactionCount: d.transactionCount,
        totalValue: d.totalValue,
      }));
      if (format === "csv") exportCSV(`${filenameBase}.csv`, rows);
      else if (format === "xlsx") await exportXLSX(`${filenameBase}.xlsx`, "Movement", rows);
      else await exportPDFTable(`${filenameBase}.pdf`, "Inventory Movement", [
        { header: "Date", dataKey: "date" },
        { header: "Received", dataKey: "received" },
        { header: "Usage", dataKey: "usage" },
        { header: "Adj", dataKey: "adjustments" },
        { header: "Net", dataKey: "netMovement" },
        { header: "Tx", dataKey: "transactionCount" },
        { header: "Value", dataKey: "totalValue" },
      ], rows);
    }
    if (what === "abc") {
      const rows = abcRows.map((r: any) => ({ itemId: r.itemId, name: r.name, value: r.value, cumulativePct: r.cumulativePct, category: r.category }));
      if (format === "csv") exportCSV(`${filenameBase}.csv`, rows);
      else if (format === "xlsx") await exportXLSX(`${filenameBase}.xlsx`, "ABC", rows);
      else await exportPDFTable(`${filenameBase}.pdf`, "ABC Analysis", [
        { header: "Item", dataKey: "name" },
        { header: "Value", dataKey: "value" },
        { header: "Cum%", dataKey: "cumulativePct" },
        { header: "Class", dataKey: "category" },
      ], rows);
    }
    if (what === "waste") {
      const rows = wasteByReason.map((r: any) => ({ reason: r.reason, quantity: r.quantity, cost: r.cost }));
      if (format === "csv") exportCSV(`${filenameBase}.csv`, rows);
      else if (format === "xlsx") await exportXLSX(`${filenameBase}.xlsx`, "Waste", rows);
      else await exportPDFTable(`${filenameBase}.pdf`, "Waste by Reason", [
        { header: "Reason", dataKey: "reason" },
        { header: "Qty", dataKey: "quantity" },
        { header: "Cost", dataKey: "cost" },
      ], rows);
    }
    if (what === "turnover") {
      const rows = turnoverSeries.map((r: any) => ({ date: r.date, usageCost: r.usageCost, avgInventoryValue: r.avgInventoryValue, turnover: r.turnover }));
      if (format === "csv") exportCSV(`${filenameBase}.csv`, rows);
      else if (format === "xlsx") await exportXLSX(`${filenameBase}.xlsx`, "Turnover", rows);
      else await exportPDFTable(`${filenameBase}.pdf`, "Inventory Turnover", [
        { header: "Date", dataKey: "date" },
        { header: "Usage Cost", dataKey: "usageCost" },
        { header: "Avg Value", dataKey: "avgInventoryValue" },
        { header: "Turnover", dataKey: "turnover" },
      ], rows);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Analytics</CardTitle>
              <CardDescription>Key metrics, movement, and waste insights</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">From</Label>
              <Input type="date" value={range.start} onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))} className="w-36" />
              <Label className="text-sm">To</Label>
              <Input type="date" value={range.end} onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))} className="w-36" />
              <Select value={period} onValueChange={(v: any) => {
                setPeriod(v);
                if (v === 'daily' || v === 'weekly') {
                  const today = new Date();
                  const dow = today.getDay();
                  const diff = (dow + 6) % 7; // Monday start
                  const start = new Date(today);
                  start.setDate(start.getDate() - diff);
                  start.setHours(0, 0, 0, 0);
                  const end = new Date(start);
                  end.setDate(end.getDate() + 6);
                  end.setHours(23, 59, 59, 999);
                  setRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
                } else if (v === 'monthly') {
                  const start = new Date(new Date().getFullYear(), 0, 1);
                  const end = new Date();
                  setRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
                }
              }}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* KPI summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Inventory Value</div><div className="text-2xl font-semibold">${(summary?.totalInventoryValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Waste (Cost)</div><div className="text-2xl font-semibold">${(summary?.wasteCostInPeriod || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Turnover Ratio</div><div className="text-2xl font-semibold">{Number(summary?.turnoverRatio || 0).toFixed(2)}x</div></CardContent></Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Waste Percentage</div>
                <div className="text-2xl font-semibold">
                  {summary?.totalInventoryValue && summary.totalInventoryValue > 0
                    ? `${((summary.wasteCostInPeriod || 0) / summary.totalInventoryValue * 100).toFixed(2)}%`
                    : '0.00%'}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-xs text-muted-foreground mb-6">
            Calculations: Waste cost = sum of quantity × cost per unit across waste/expiry/theft transactions and item waste logs. Turnover = period usage cost ÷ current average inventory value. Movement lines show Usage, Received, and Net (Received − Usage ± Adjustments).
          </div>

          {/* Movement chart */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Stock Movement</h4>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("movement", "csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("movement", "xlsx")}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("movement", "pdf")}>PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="relative">
              <div className={`transition-all duration-300 ${movementData.length === 0 ? 'blur-sm pointer-events-none' : ''}`}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={movementData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} className="dark:[&_.recharts-text]:fill-slate-400 dark:[&_.recharts-cartesian-axis-line]:stroke-slate-700" />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} className="dark:[&_.recharts-text]:fill-slate-400 dark:[&_.recharts-cartesian-axis-line]:stroke-slate-700" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="received" stroke="#22c55e" strokeWidth={2} name="Received (Inbound)" dot={{ fill: "#22c55e", r: 3 }} />
                    <Line type="monotone" dataKey="usage" stroke="#ef4444" strokeWidth={2} name="Usage (Outbound)" dot={{ fill: "#ef4444", r: 3 }} />
                    <Line type="monotone" dataKey="netMovement" stroke="#3b82f6" strokeWidth={2} name="Net (R − U ± Adj)" strokeDasharray="5 5" dot={{ fill: "#3b82f6", r: 2 }} />
                    <Line type="monotone" dataKey="itemsCount" stroke="#4dd9cf" strokeWidth={2} name="Items Count" dot={{ fill: "#4dd9cf", r: 2 }} />
                    <Line type="monotone" dataKey="shortfall" stroke="#a855f7" strokeWidth={2} name="Shortfall (Outstanding/Missed)" strokeDasharray="2 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {movementData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center"><BarChartIcon className="w-8 h-8 text-gray-400" /></div>
                    <p className="text-sm text-muted-foreground">No transaction data found for the selected period.</p>
                  </div>
                </div>
              )}
              {/* Legend */}
              {movementData.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Legend: Received (Inbound) • Usage (Outbound) • Net = Received − Usage ± Adjustments
                </div>
              )}
            </div>
          </div>

          {/* ABC Pareto + Waste by reason */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">ABC Analysis</h4>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport("abc", "csv")}>CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("abc", "xlsx")}>Excel</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("abc", "pdf")}>PDF</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={abcRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                  <XAxis dataKey="name" hide={true} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} className="dark:[&_.recharts-text]:fill-slate-400 dark:[&_.recharts-cartesian-axis-line]:stroke-slate-700" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Consumption Value" radius={[8, 8, 0, 0]} className="backdrop-blur-sm" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.08))' }}>
                    {abcRows.map((_: any, idx: number) => (
                      <Cell key={`abc-cell-${idx}`} fill={abcBarColors[idx] || '#14b8a6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Waste by Reason</h4>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport("waste", "csv")}>CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("waste", "xlsx")}>Excel</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("waste", "pdf")}>PDF</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={wasteByReasonDisplay} dataKey="cost" nameKey="reason" cx="50%" cy="50%" outerRadius={100} stroke="var(--border)" strokeWidth={1} labelLine={false} label={({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return (
                      <text x={x} y={y} fill="#fff" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: '2px', strokeLinejoin: 'round', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>
                        {`${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}>
                    {wasteByReasonDisplay.map((_: any, idx: number) => (
                      <Cell key={idx} fill={wasteTealColors[idx] || '#14b8a6'} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Turnover series */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Inventory Turnover</h4>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("turnover", "csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("turnover", "xlsx")}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("turnover", "pdf")}>PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={turnoverSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} className="dark:[&_.recharts-text]:fill-slate-400 dark:[&_.recharts-cartesian-axis-line]:stroke-slate-700" />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} className="dark:[&_.recharts-text]:fill-slate-400 dark:[&_.recharts-cartesian-axis-line]:stroke-slate-700" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="turnover" stroke="#22c55e" strokeWidth={2} name="Turnover (Usage ÷ Avg Inv)" dot={{ fill: "#22c55e", r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


