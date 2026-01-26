"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useShopAnalytics } from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Gauge,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CustomChartTooltip from "@/components/ui/chart-tooltip";

const PERIOD_OPTIONS = [
  { label: "Last 14 Days", period: "daily", range: 14 },
  { label: "Last 8 Weeks", period: "weekly", range: 8 },
  { label: "Last 6 Months", period: "monthly", range: 6 },
];

export default function AnalyticsPage() {
  const permissions = usePermissions();
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0]);
  const [selectedMetric, setSelectedMetric] = useState("revenue");

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (period.range - 1) * (period.period === "daily" ? 24 : period.period === "weekly" ? 7 * 24 : 30 * 24) * 60 * 60 * 1000);

  const { data, loading } = useShopAnalytics({
    period: period.period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const snapshots = data?.shopAnalytics ?? [];
  const latest = snapshots[snapshots.length - 1];
  const revenueTrend = useMemo(() => latest?.revenueTrend ?? [], [latest]);
  const bayPerformance = latest?.bayPerformance ?? [];
  const techLeaderboard = latest?.technicianLeaderboard ?? [];
  const topCategories = latest?.topServiceCategories ?? [];
  const alerts = latest?.alerts ?? [];

  const summaryMetrics = [
    {
      label: "Revenue",
      value: latest ? `$${latest.totalRevenue.toLocaleString()}` : "—",
      change: latest ? latest.grossProfit : null,
      icon: BarChart3,
    },
    {
      label: "Average Repair Order",
      value: latest ? `$${latest.averageRepairOrder.toFixed(0)}` : "—",
      change: latest ? latest.vehiclesServiced : null,
      icon: Wrench,
    },
    {
      label: "Bay Utilization",
      value: latest ? `${latest.bayUtilization.toFixed(0)}%` : "—",
      change: latest ? latest.partsTurnoverDays : null,
      icon: Gauge,
    },
    {
      label: "Technician Efficiency",
      value: latest ? `${latest.technicianEfficiency.toFixed(0)}%` : "—",
      change: latest ? latest.comebackRate : null,
      icon: Activity,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Shop Analytics</h1>
            <p className="text-muted-foreground">Real-time command over revenue, technician productivity, and bay capacity. Every KPI is wired to action.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={period.label}
              onValueChange={(value) => {
                const next = PERIOD_OPTIONS.find((option) => option.label === value);
                if (next) setPeriod(next);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.label} value={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <CalendarRange className="h-4 w-4" />
              {format(startDate, "MMM d")} – {format(endDate, "MMM d, yyyy")}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryMetrics.map((metric) => (
            <Card key={metric.label} className="border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
                <metric.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{metric.value}</div>
                {metric.change !== null && metric.change !== undefined && (
                  <p className="text-xs text-muted-foreground">Period change: {typeof metric.change === "number" ? metric.change.toLocaleString() : metric.change}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Revenue & Throughput</CardTitle>
              <p className="text-sm text-muted-foreground">Monitor revenue velocity alongside vehicles serviced to stay ahead of staffing and capacity needs.</p>
            </div>
            <Tabs value={selectedMetric} onValueChange={setSelectedMetric}>
              <TabsList>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="labor">Labor vs Parts</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-80">
            {selectedMetric === "revenue" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" stroke="currentColor" className="text-xs text-muted-foreground" />
                  <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tickFormatter={(value) => `$${value / 1000}k`} />
                  {/* @ts-ignore */}
                  <Tooltip content={<CustomChartTooltip valueFormatter={(value) => `$${Number(value).toLocaleString()}`} />} />
                  <Line type="monotone" dataKey="value" strokeWidth={2} stroke="var(--primary)" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={snapshots.map((snapshot) => ({ label: format(new Date(snapshot.date), period.period === "daily" ? "MMM d" : "MMM"), labor: snapshot.laborRevenue, parts: snapshot.partsRevenue }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs text-muted-foreground" />
                  <YAxis className="text-xs text-muted-foreground" tickFormatter={(value) => `$${value / 1000}k`} />
                  {/* @ts-ignore */}
                  <Tooltip content={<CustomChartTooltip valueFormatter={(value) => `$${Number(value).toLocaleString()}`} />} />
                  <Bar dataKey="labor" stackId="a" fill="var(--primary)" />
                  <Bar dataKey="parts" stackId="a" fill="hsl(var(--primary) / 0.4)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-[3fr,2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Bay Performance</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bayPerformance.map((bay) => ({
                  bay: bay.bay?.label ?? "Bay",
                  utilization: bay.utilization,
                  throughput: bay.throughput,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bay" className="text-xs text-muted-foreground" />
                  <YAxis className="text-xs text-muted-foreground" />
                  {/* @ts-ignore */}
                  <Tooltip content={<CustomChartTooltip valueFormatter={(value) => `${value}%`} />} />
                  <Bar dataKey="utilization" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Technician Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {techLeaderboard.map((tech, index) => (
                <div key={tech.technician?.id ?? index} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="font-semibold text-foreground">{tech.technician?.name ?? "Technician"}</div>
                    <p className="text-xs text-muted-foreground">Efficiency {tech.efficiency?.toFixed(0)}% • Upsell {tech.upsellRate?.toFixed(0)}%</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{tech.billedHours?.toFixed(1)} billed hrs</Badge>
                </div>
              ))}
              {techLeaderboard.length === 0 && <p className="text-sm text-muted-foreground">No technician data available for this period.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Service Mix</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {topCategories.map((slice) => (
                <div key={slice.category} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{slice.category}</p>
                      <div className="text-xl font-semibold text-foreground">${slice.value.toLocaleString()}</div>
                    </div>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  {slice.change !== null && slice.change !== undefined && <p className="mt-2 text-xs text-muted-foreground">Change {slice.change.toFixed(1)}%</p>}
                </div>
              ))}
              {topCategories.length === 0 && <p className="text-sm text-muted-foreground">No category insights for this range.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Operational Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={index} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-semibold text-foreground">{alert.title}</p>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    {alert.suggestedAction && <p className="text-xs text-primary">Next step: {alert.suggestedAction}</p>}
                  </div>
                </div>
              ))}
              {alerts.length === 0 && <p className="text-sm text-muted-foreground">No alerts — operations are humming.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
