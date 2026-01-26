
"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useTeamMembers,
  useShifts,
  useShopAnalytics,
  useInventorySummary,
  useInventoryAlerts,
  useServiceLaneTickets,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CustomChartTooltip from "@/components/ui/chart-tooltip";
import { LoadingBarChart, LoadingDonutPie } from "@/components/ui/loading-charts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle,
  ClipboardList,
  Clock,
  DollarSign,
  Gauge,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import WidgetsGrid from "@/components/dashboard/WidgetsGrid";
import { format } from "date-fns";

type InsightCard = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  action?: { label: string; href: string };
};

interface ScheduleEntry {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  isActive: boolean;
  start?: Date | null;
  end?: Date | null;
  shiftWindow: string;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const currencyFormatterPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatCurrency(value?: number | null, withCents = false) {
  if (value == null || Number.isNaN(value)) return "--";
  return (withCents ? currencyFormatterPrecise : currencyFormatter).format(value);
}

function formatPercent(value?: number | null, decimals = 1) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${Number(value).toFixed(decimals)}%`;
}

function formatMinutesToLabel(minutes?: number | null) {
  if (minutes == null || Number.isNaN(minutes)) return "--";
  const total = Math.max(0, minutes);
  const hours = Math.floor(total / 60);
  const mins = Math.round(total % 60);
  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, "0")}m`;
  }
  return `${mins}m`;
}

function average(values: Array<number | null | undefined>) {
  const filtered = values
    .map((value) => (value == null ? null : Number(value)))
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function computeChange(
  current?: number | null,
  previous?: number | null,
  options: { mode?: "percent" | "absolute"; precision?: number; suffix?: string } = {},
) {
  const { mode = "percent", precision = 1, suffix = "" } = options;
  if (
    current == null ||
    previous == null ||
    Number.isNaN(current) ||
    Number.isNaN(previous)
  ) {
    return { label: "vs prior day", type: "neutral" as const };
  }
  if (mode === "percent") {
    if (previous === 0) {
      return { label: "vs prior day", type: "neutral" as const };
    }
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (!Number.isFinite(pct)) {
      return { label: "vs prior day", type: "neutral" as const };
    }
    const formatted = pct.toFixed(precision);
    const type = pct > 0 ? ("positive" as const) : pct < 0 ? ("negative" as const) : ("neutral" as const);
    return {
      label: `${pct >= 0 ? "+" : ""}${formatted}% vs prior`,
      type,
    };
  }

  const delta = current - previous;
  const formatted = delta.toFixed(precision);
  const type = delta > 0 ? ("positive" as const) : delta < 0 ? ("negative" as const) : ("neutral" as const);
  return {
    label: `${delta >= 0 ? "+" : ""}${formatted}${suffix} vs prior`,
    type,
  };
}

function timeAgo(input?: string | number | Date) {
  if (!input) return "just now";
  const timestamp = typeof input === "string" || typeof input === "number" ? new Date(input).getTime() : input.getTime();
  if (!Number.isFinite(timestamp)) return "just now";
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function combineDateAndTime(date?: string | null, time?: string | null) {
  if (!date) return null;
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  if (time) {
    const [hours, minutes] = time.split(":").map((part) => Number(part));
    base.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  }
  return base;
}

function generateTealPalette(count: number) {
  const baseHue = 171;
  const saturation = 65;
  if (count <= 0) return ["hsl(171, 65%, 58%)"];
  return Array.from({ length: count }).map((_, index) => {
    const lightness = 90 - index * (50 / Math.max(1, count - 1));
    return `hsl(${baseHue}, ${saturation}%, ${Math.max(35, Math.min(90, lightness))}%)`;
  });
}
function RecentActivity() {
  const [items, setItems] = useState<Array<{ id: string; status: "success" | "warning" | "info"; message: string; time: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/activity/recent");
        const json = await response.json();
        if (mounted && json?.success && Array.isArray(json.data)) {
          setItems(
            json.data.map((item: any, index: number) => ({
              id: item.id ?? `activity-${index}`,
              status: item.status === "warning" ? "warning" : item.status === "success" ? "success" : "info",
              message: item.message ?? "",
              time: item.time ?? new Date().toISOString(),
            })),
          );
        }
      } catch {
        // ignore network errors, we'll fall back to generated items
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const fallback = useMemo(
    () => [
      {
        id: "fallback-1",
        status: "success" as const,
        message: "Invoice RO-1184 collected with digital signature.",
        time: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      },
      {
        id: "fallback-2",
        status: "warning" as const,
        message: "FleetSafe Fluids shipment delayed — update promised times for coolant flush jobs.",
        time: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      },
      {
        id: "fallback-3",
        status: "info" as const,
        message: "Autonomous tool cart Delta-2 completed software patch v2.4.1.",
        time: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      },
    ],
    [],
  );

  const displayItems = items.length > 0 ? items : fallback;

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {displayItems.map((activity) => {
        const icon =
          activity.status === "success" ? (
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : activity.status === "warning" ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          );
        const bgClass =
          activity.status === "success"
            ? "bg-emerald-100 dark:bg-emerald-900/25"
            : activity.status === "warning"
              ? "bg-amber-100 dark:bg-amber-900/25"
              : "bg-sky-100 dark:bg-sky-900/25";
        return (
          <div key={activity.id} className="flex items-start space-x-3">
            <div className={`rounded-full p-1 ${bgClass}`}>{icon}</div>
            <div className="flex-1">
              <p className="text-sm text-foreground">{activity.message}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(activity.time)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link
        href="/dashboard/inventory"
        className="flex h-auto flex-col items-center rounded-md border p-3 transition-colors hover:bg-muted"
      >
        <Package className="mb-1 h-4 w-4" />
        <span className="text-xs">Parts Inventory</span>
      </Link>
      <Link
        href="/dashboard/menu"
        className="flex h-auto flex-col items-center rounded-md border p-3 transition-colors hover:bg-muted"
      >
        <Wrench className="mb-1 h-4 w-4" />
        <span className="text-xs">Service Catalog</span>
      </Link>
      <Link
        href="/dashboard/scheduling"
        className="flex h-auto flex-col items-center rounded-md border p-3 transition-colors hover:bg-muted"
      >
        <Gauge className="mb-1 h-4 w-4" />
        <span className="text-xs">Technician Schedule</span>
      </Link>
      <Link
        href="/dashboard/robotic-fleets"
        className="flex h-auto flex-col items-center rounded-md border p-3 transition-colors hover:bg-muted"
      >
        <Bot className="mb-1 h-4 w-4" />
        <span className="text-xs">Automation Control</span>
      </Link>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: InsightCard[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed((prev) => prev.filter((id) => insights.some((insight) => insight.id === id)));
  }, [insights]);

  const visible = insights.filter((insight) => !dismissed.includes(insight.id));
  if (visible.length === 0) return null;

  const severityStyles: Record<InsightCard["severity"], string> = {
    info: "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/30 dark:border-sky-800",
    warning: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800",
    critical: "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800",
  };

  const severityIcon: Record<InsightCard["severity"], any> = {
    info: <Brain className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    critical: <AlertTriangle className="h-4 w-4" />,
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {visible.map((insight) => (
        <Card
          key={insight.id}
          className={`${severityStyles[insight.severity]} border`}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-white/60 p-1 dark:bg-background/60">
                  {severityIcon[insight.severity]}
                </span>
                {insight.title}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setDismissed((prev) => (prev.includes(insight.id) ? prev : [...prev, insight.id]))
                }
              >
                Dismiss
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
            {insight.action && (
              <div>
                <Link href={insight.action.href} className="text-sm font-medium text-foreground underline underline-offset-4">
                  {insight.action.label}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const SERVICE_LANE_STATUS_LABELS: Record<string, string> = {
  awaiting_check_in: "Awaiting check-in",
  waiting_on_approval: "Awaiting approval",
  waiting_parts: "Waiting on parts",
  in_service: "In service",
  road_test: "Road test",
  ready_for_pickup: "Ready for pickup",
  delivered: "Delivered",
};

const SERVICE_LANE_STATUS_COLORS: Record<string, string> = {
  awaiting_check_in: "bg-slate-200 text-slate-900",
  waiting_on_approval: "bg-amber-100 text-amber-800",
  waiting_parts: "bg-amber-200 text-amber-900",
  in_service: "bg-sky-100 text-sky-700",
  road_test: "bg-indigo-100 text-indigo-700",
  ready_for_pickup: "bg-emerald-100 text-emerald-700",
  delivered: "bg-emerald-200 text-emerald-900",
};
export default function DashboardPage() {
  const permissions = usePermissions();
  const canViewFinancialData = permissions.canViewFinancialData();

  const [metricTab, setMetricTab] = useState("revenue");
  const [scheduleTab, setScheduleTab] = useState("all");

  const analyticsRange = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);

  const { data: analyticsData, loading: analyticsLoading } = useShopAnalytics({
    period: "daily",
    startDate: analyticsRange.start,
    endDate: analyticsRange.end,
  });
  const analyticsSeries = analyticsData?.shopAnalytics ?? [];
  const latestAnalytics = analyticsSeries[analyticsSeries.length - 1];
  const previousAnalytics = analyticsSeries.length > 1 ? analyticsSeries[analyticsSeries.length - 2] : undefined;

  const { data: teamData, loading: teamLoading } = useTeamMembers();

  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);

  const { data: shiftsData, loading: shiftsLoading } = useShifts({
    startDate: todayRange.start,
    endDate: todayRange.end,
  });

  const { data: inventorySummaryData, loading: inventorySummaryLoading } = useInventorySummary();
  const { data: inventoryAlertsData } = useInventoryAlerts();
  const { data: serviceLaneData } = useServiceLaneTickets();

  const metrics = useMemo(() => {
    const items = [
      {
        key: "revenue",
        title: "Service Revenue Today",
        value: formatCurrency(latestAnalytics?.totalRevenue),
        change: computeChange(latestAnalytics?.totalRevenue, previousAnalytics?.totalRevenue),
        icon: DollarSign,
        financial: true,
      },
      {
        key: "vehicles",
        title: "Vehicles Completed",
        value: latestAnalytics?.vehiclesServiced != null ? latestAnalytics.vehiclesServiced.toLocaleString() : "--",
        change: computeChange(
          latestAnalytics?.vehiclesServiced,
          previousAnalytics?.vehiclesServiced,
          { mode: "percent", precision: 1 },
        ),
        icon: Users,
        financial: false,
      },
      {
        key: "aro",
        title: "Average Repair Order",
        value: formatCurrency(latestAnalytics?.averageRepairOrder, true),
        change: computeChange(
          latestAnalytics?.averageRepairOrder,
          previousAnalytics?.averageRepairOrder,
          { mode: "percent", precision: 1 },
        ),
        icon: ClipboardList,
        financial: true,
      },
      {
        key: "bayUtilization",
        title: "Bay Utilization",
        value: formatPercent(latestAnalytics?.bayUtilization),
        change: computeChange(
          latestAnalytics?.bayUtilization,
          previousAnalytics?.bayUtilization,
          { mode: "absolute", precision: 1, suffix: " pts" },
        ),
        icon: Gauge,
        financial: false,
      },
      {
        key: "techEfficiency",
        title: "Technician Efficiency",
        value: formatPercent(latestAnalytics?.technicianEfficiency),
        change: computeChange(
          latestAnalytics?.technicianEfficiency,
          previousAnalytics?.technicianEfficiency,
          { mode: "absolute", precision: 1, suffix: " pts" },
        ),
        icon: Wrench,
        financial: false,
      },
    ];

    return items;
  }, [latestAnalytics, previousAnalytics]);

  const displayedMetrics = useMemo(
    () => metrics.filter((metric) => canViewFinancialData || !metric.financial),
    [metrics, canViewFinancialData],
  );

  const weeklyTrend = useMemo(() => {
    return analyticsSeries
      .slice(Math.max(analyticsSeries.length - 7, 0))
      .map((entry) => {
        const label = entry?.date ? format(new Date(entry.date), "EEE") : "Day";
        const avgCycle = average(
          (entry?.bayPerformance ?? []).map((bay: any) => bay?.averageCycleTimeMinutes ?? null),
        );
        return {
          label,
          revenue: entry?.totalRevenue ?? 0,
          orders: entry?.vehiclesServiced ?? 0,
          cycle: avgCycle ?? 0,
        };
      });
  }, [analyticsSeries]);

  const scheduleEntries: ScheduleEntry[] = useMemo(() => {
    const teamById = new Map(
      (teamData?.teamMembers ?? []).map((member: any) => [member.id, member]),
    );
    return (shiftsData?.shifts ?? [])
      .map((shift: any) => {
        const assigned = shift.assignedTo?.id ? teamById.get(shift.assignedTo.id) ?? shift.assignedTo : shift.assignedTo;
        const start = combineDateAndTime(shift.date, shift.startTime);
        const end = combineDateAndTime(shift.date, shift.endTime);
        const department = assigned?.department ?? "General Ops";
        const shiftWindow =
          start && end
            ? `${format(start, "p")} - ${format(end, "p")}`
            : shift.startTime && shift.endTime
              ? `${shift.startTime} - ${shift.endTime}`
              : "Scheduled";
        return {
          id: shift.id,
          name: assigned?.name ?? shift.role ?? "Unassigned",
          role: assigned?.role ?? shift.role ?? "Shift",
          department,
          status: shift.status ?? "scheduled",
          isActive: (shift.status ?? ``).toLowerCase() === "active",
          start,
          end,
          shiftWindow,
        };
      })
      .sort((a, b) => {
        const aTime = a.start?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = b.start?.getTime() ?? Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [shiftsData, teamData]);

  const departments = useMemo(
    () =>
      Array.from(new Set(scheduleEntries.map((entry) => entry.department))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [scheduleEntries],
  );

  const scheduleGroups = useMemo(() => {
    return scheduleEntries.reduce<Record<string, ScheduleEntry[]>>((acc, entry) => {
      if (!acc[entry.department]) {
        acc[entry.department] = [];
      }
      acc[entry.department].push(entry);
      return acc;
    }, {});
  }, [scheduleEntries]);

  const activeShiftsCount = scheduleEntries.filter((entry) => entry.isActive).length;

  const laneTickets = serviceLaneData?.serviceLaneTickets ?? [];
  const laneStatusCounts = useMemo(() => {
    return (laneTickets as any[]).reduce<Record<string, number>>((acc, ticket) => {
      const status = ticket.status ?? "awaiting_check_in";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
  }, [laneTickets]);

  const inventorySummary = inventorySummaryData?.inventorySummary;
  const inventoryCategories = useMemo(() => {
    if (!inventorySummary?.topCategories?.length) return [];
    const palette = generateTealPalette(inventorySummary.topCategories.length);
    const total = inventorySummary.topCategories.reduce((sum, category) => sum + (category.value ?? 0), 0);
    return inventorySummary.topCategories.map((category, index) => ({
      name: category.category ?? "Other",
      percent: total > 0 ? Math.round(((category.value ?? 0) / total) * 100) : 0,
      raw: category.value ?? 0,
      color: palette[index % palette.length],
    }));
  }, [inventorySummary]);

  const inventoryAlerts = inventoryAlertsData?.inventoryAlerts ?? [];

  const insights = useMemo<InsightCard[]>(() => {
    const cards: InsightCard[] = [];
    (latestAnalytics?.alerts ?? []).forEach((alert: any, index: number) => {
      cards.push({
        id: `analytics-${index}`,
        severity: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "info",
        title: alert.title ?? "Shop Insight",
        message: alert.message ?? "",
        action: alert.suggestedAction
          ? { label: "View analytics", href: "/dashboard/analytics" }
          : undefined,
      });
    });
    inventoryAlerts.slice(0, 3).forEach((alert: any) => {
      cards.push({
        id: `inventory-${alert.id}`,
        severity: alert.severity === "critical" ? "critical" : "warning",
        title: alert.inventoryItem?.name
          ? `Inventory: ${alert.inventoryItem.name}`
          : "Inventory alert",
        message: alert.message ?? "Inventory attention required.",
        action: { label: "Review inventory", href: "/dashboard/inventory" },
      });
    });

    const waitingParts = laneStatusCounts.waiting_parts ?? 0;
    if (waitingParts > 0) {
      cards.push({
        id: "lane-waiting-parts",
        severity: "warning",
        title: "Service lane stalled",
        message: `${waitingParts} vehicle${waitingParts === 1 ? "" : "s"} waiting on parts. Coordinate with the parts counter to clear the backlog.`,
        action: { label: "Open service lane", href: "/dashboard/hostpro" },
      });
    }

    if (cards.length === 0 && latestAnalytics) {
      cards.push({
        id: "steady-state",
        severity: "info",
        title: "Stable operations",
        message:
          "No critical issues detected. Prep tomorrow by staging parts and confirming technician availability.",
      });
    }

    return cards;
  }, [latestAnalytics, inventoryAlerts, laneStatusCounts]);

  const technicianLeaderboard = (latestAnalytics?.technicianLeaderboard ?? []).slice(0, 4);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">LedgerOne Auto Shop Command</h1>
            <p className="text-muted-foreground">
              Monitor service performance, technician load, and shop automation from a single back office.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const event = new CustomEvent("open-varuni");
                window.dispatchEvent(event);
              }}
            >
              <Brain className="mr-2 h-4 w-4" />
              Ask Varuni
            </Button>
          </div>
        </div>

        <InsightsPanel insights={insights} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {displayedMetrics.map((metric) => {
            const Icon = metric.icon;
            const changeClass =
              metric.change.type === "positive"
                ? "text-emerald-600"
                : metric.change.type === "negative"
                  ? "text-rose-600"
                  : "text-muted-foreground";
            return (
              <Card key={metric.key}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                      {analyticsLoading && metric.value === "--" ? (
                        <div className="mt-2 flex items-center text-muted-foreground">
                          <Clock className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </div>
                      ) : (
                        <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
                      )}
                      <div className={`mt-1 flex items-center text-xs font-medium ${changeClass}`}>
                        {metric.change.type === "positive" && <TrendingUp className="mr-1 h-3 w-3" />}
                        {metric.change.type === "negative" && <TrendingDown className="mr-1 h-3 w-3" />}
                        <span>{metric.change.label}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3 text-primary dark:bg-primary/10">
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Shop Performance</CardTitle>
                <CardDescription>Revenue, throughput, and cycle times over the last seven days</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={metricTab} onValueChange={setMetricTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="orders">Vehicles</TabsTrigger>
                    <TabsTrigger value="cycle">Cycle time</TabsTrigger>
                  </TabsList>

                  <TabsContent value="revenue" className="mt-6">
                    {weeklyTrend.length === 0 ? (
                      <LoadingBarChart />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={weeklyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <Tooltip
                            content={
                              <CustomChartTooltip
                                formatter={(value) => [
                                  typeof value === "number" ? currencyFormatterPrecise.format(value) : String(value),
                                  "Revenue",
                                ]}
                              />
                            }
                          />
                          <Bar dataKey="revenue">
                            {weeklyTrend.map((entry, index) => (
                              <Cell key={entry.label} fill={generateTealPalette(weeklyTrend.length)[index]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </TabsContent>

                  <TabsContent value="orders" className="mt-6">
                    {weeklyTrend.length === 0 ? (
                      <LoadingBarChart />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={weeklyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <Tooltip
                            content={
                              <CustomChartTooltip
                                formatter={(value) => [
                                  typeof value === "number" ? `${value.toFixed(0)} vehicles` : String(value),
                                  "Vehicles serviced",
                                ]}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="orders"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 4, strokeWidth: 2, fill: "#10b981" }}
                            activeDot={{ r: 6, fill: "#10b981" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </TabsContent>

                  <TabsContent value="cycle" className="mt-6">
                    {weeklyTrend.length === 0 ? (
                      <LoadingBarChart />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={weeklyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" className="dark:stroke-slate-700" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            axisLine={{ stroke: "hsl(var(--border))" }}
                            className="dark:[&_.recharts-text]:fill-slate-400"
                          />
                          <Tooltip
                            content={
                              <CustomChartTooltip
                                formatter={(value) => [
                                  typeof value === "number" ? formatMinutesToLabel(value) : String(value),
                                  "Avg cycle time",
                                ]}
                              />
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="cycle"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={{ r: 4, strokeWidth: 2, fill: "#2563eb" }}
                            activeDot={{ r: 6, fill: "#2563eb" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service Lane Snapshot</CardTitle>
                <CardDescription>
                  Real-time status of vehicles in the drive and bays
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SERVICE_LANE_STATUS_LABELS).map(([status, label]) => (
                    <span
                      key={status}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${SERVICE_LANE_STATUS_COLORS[status] ?? "bg-slate-100 text-slate-900"}`}
                    >
                      {label}: {laneStatusCounts[status] ?? 0}
                    </span>
                  ))}
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">
                    {laneTickets.length > 0
                      ? `${laneTickets.length} active vehicle${laneTickets.length === 1 ? "" : "s"} in process`
                      : "No active service lane tickets right now"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {laneStatusCounts.in_service ?? 0} in bays · {laneStatusCounts.waiting_on_approval ?? 0} awaiting customer approval ·{" "}
                    {laneStatusCounts.ready_for_pickup ?? 0} ready for pick-up
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s Staffing</CardTitle>
                <CardDescription>
                  Active shifts across service bays, diagnostics, and the front counter
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={scheduleTab} onValueChange={setScheduleTab}>
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${departments.length + 2}, minmax(0, 1fr))` }}>
                    <TabsTrigger value="all">All</TabsTrigger>
                    {departments.map((department) => (
                      <TabsTrigger key={department} value={department}>
                        {department}
                      </TabsTrigger>
                    ))}
                    <TabsTrigger value="gantt">Timeline</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-4 space-y-4">
                    {scheduleEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No scheduled shifts for today. Check tomorrow&apos;s schedule to stay ahead.
                      </p>
                    ) : (
                      departments.map((department) => (
                        <div key={department} className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {department}
                          </div>
                          {(scheduleGroups[department] ?? []).map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between rounded-lg border p-3 ${entry.isActive ? "" : "opacity-80"}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                  {entry.name
                                    .split(" ")
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{entry.name}</p>
                                  <p className="text-xs text-muted-foreground">{entry.role}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-semibold text-foreground">{entry.shiftWindow}</p>
                                <div className="mt-1 flex items-center justify-end text-xs">
                                  {entry.isActive ? (
                                    <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                                      <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
                                      Active
                                    </span>
                                  ) : (
                                    <span className="flex items-center text-muted-foreground">
                                      <Clock className="mr-1 h-3 w-3" />
                                      Scheduled
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {departments.map((department) => (
                    <TabsContent key={department} value={department} className="mt-4 space-y-3">
                      {(scheduleGroups[department] ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No scheduled shifts in {department} today.
                        </p>
                      ) : (
                        (scheduleGroups[department] ?? []).map((entry) => (
                          <div
                            key={entry.id}
                            className={`flex items-center justify-between rounded-lg border p-3 ${entry.isActive ? "" : "opacity-80"}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                {entry.name
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{entry.name}</p>
                                <p className="text-xs text-muted-foreground">{entry.role}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-foreground">{entry.shiftWindow}</p>
                              <div className="mt-1 flex items-center justify-end text-xs">
                                {entry.isActive ? (
                                  <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                                    <span className="mr-2 h-2 w-2 rounded-full bg-emerald-500" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="flex items-center text-muted-foreground">
                                    <Clock className="mr-1 h-3 w-3" />
                                    Scheduled
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>
                  ))}

                  <TabsContent value="gantt" className="mt-4 space-y-3">
                    {scheduleEntries.filter((entry) => entry.start && entry.end).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No shift timing data available for timeline view.
                      </p>
                    ) : (
                      (() => {
                        const plotted = scheduleEntries.filter((entry) => entry.start && entry.end);
                        const minStart = Math.min(...plotted.map((entry) => entry.start!.getTime()));
                        const maxEnd = Math.max(...plotted.map((entry) => entry.end!.getTime()));
                        const range = Math.max(1, maxEnd - minStart);
                        return (
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(minStart), "p")}–{format(new Date(maxEnd), "p")}
                            </div>
                            <div className="space-y-2">
                              {plotted.map((entry) => {
                                const left = ((entry.start!.getTime() - minStart) / range) * 100;
                                const width = ((entry.end!.getTime() - entry.start!.getTime()) / range) * 100;
                                return (
                                  <div key={entry.id} className="flex items-center gap-3">
                                    <div className="w-40 shrink-0">
                                      <p className="text-sm font-medium text-foreground">{entry.name}</p>
                                      <p className="text-xs text-muted-foreground">{entry.role}</p>
                                    </div>
                                    <div className="relative h-6 w-full rounded bg-muted">
                                      <div
                                        className={`absolute top-0 h-6 rounded ${entry.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                                        style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Overview</CardTitle>
                <CardDescription>Category mix and alerting signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {inventorySummaryLoading ? (
                  <LoadingDonutPie />
                ) : inventoryCategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No inventory summary available yet. Run the seed or import catalog data.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={inventoryCategories} dataKey="percent" nameKey="name" innerRadius={50} outerRadius={80}>
                        {inventoryCategories.map((category, index) => (
                          <Cell key={category.name} fill={category.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="space-y-2">
                  {inventoryCategories.slice(0, 5).map((category) => (
                    <div key={category.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center">
                        <span
                          className="mr-2 h-3 w-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="text-muted-foreground">{category.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{category.percent}%</span>
                    </div>
                  ))}
                </div>
                {inventorySummary && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Inventory value</p>
                      <p className="font-semibold text-foreground">{formatCurrency(inventorySummary.totalInventoryValue, true)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Parts on hand</p>
                      <p className="font-semibold text-foreground">{inventorySummary.totalParts?.toLocaleString() ?? "--"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Critical items</p>
                      <p className="font-semibold text-foreground">{inventorySummary.criticalParts ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Alerts</p>
                      <p className="font-semibold text-foreground">{inventoryAlerts.length}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Technician Leaderboard</CardTitle>
                <CardDescription>Flagged hours and efficiency for top performers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {technicianLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No technician performance data yet. Once invoices and service tickets flow, metrics will populate automatically.
                  </p>
                ) : (
                  technicianLeaderboard.map((metric: any, index: number) => (
                    <div key={metric.technician?.id ?? index} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{metric.technician?.name ?? "Technician"}</p>
                        <p className="text-xs text-muted-foreground">{metric.technician?.role ?? "Role"} · {formatPercent(metric.efficiency, 0)} efficiency</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Billed hours</p>
                        <p className="text-sm font-semibold text-foreground">{metric.billedHours?.toFixed(1) ?? "0.0"}</p>
                        <p className="text-xs text-muted-foreground">Upsell {formatPercent(metric.upsellRate, 0)}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest notifications from across the shop</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentActivity />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Jump into common workflows</CardDescription>
              </CardHeader>
              <CardContent>
                <QuickActions />
              </CardContent>
            </Card>
          </div>
        </div>

        <WidgetsGrid />
      </div>
    </DashboardLayout>
  );
}
