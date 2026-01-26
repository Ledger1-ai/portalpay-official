"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useServiceLaneTickets,
  useServiceBays,
  useServicePackages,
  useUpdateServiceLaneTicketStatus,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity,
  Car,
  Clock3,
  Gauge,
  ListChecks,
  MapPin,
  Radio,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  awaiting_check_in: "bg-slate-200 text-slate-900",
  waiting_on_approval: "bg-amber-100 text-amber-700",
  waiting_parts: "bg-amber-200 text-amber-900",
  in_service: "bg-sky-100 text-sky-700",
  road_test: "bg-indigo-100 text-indigo-700",
  ready_for_pickup: "bg-emerald-100 text-emerald-700",
  delivered: "bg-emerald-200 text-emerald-900",
};

export default function ServiceLaneControlPage() {
  const permissions = usePermissions();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [bayFilter, setBayFilter] = useState<string | undefined>();

  const { data: ticketsData, refetch: refetchTickets } = useServiceLaneTickets({ status: statusFilter });
  const { data: baysData, refetch: refetchBays } = useServiceBays();
  const { data: packagesData } = useServicePackages({});
  const [updateTicketStatus, { loading: updating }] = useUpdateServiceLaneTicketStatus();

  const tickets = ticketsData?.serviceLaneTickets ?? [];
  const bays = baysData?.serviceBays ?? [];
  const servicePackages = packagesData?.servicePackages ?? [];
  const canDispatch = (permissions as any).hostpro;

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (bayFilter && ticket.bay?.id !== bayFilter) return false;
      return true;
    });
  }, [tickets, bayFilter]);

  const handleStatusChange = async (ticketId: string, status: string, bayId?: string) => {
    try {
      await updateTicketStatus({ variables: { id: ticketId, status, bayId: bayId || null } });
      toast.success("Service lane updated");
      await Promise.all([refetchTickets(), refetchBays()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update service lane ticket");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Service Lane Control</h1>
            <p className="text-muted-foreground">Co-ordinate vehicle flow, bay assignments, and customer communication from a single command surface.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={statusFilter ?? "all"} onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                <SelectItem value="awaiting_check_in">Awaiting check-in</SelectItem>
                <SelectItem value="waiting_on_approval">Waiting approval</SelectItem>
                <SelectItem value="waiting_parts">Waiting parts</SelectItem>
                <SelectItem value="in_service">In service</SelectItem>
                <SelectItem value="road_test">Road test</SelectItem>
                <SelectItem value="ready_for_pickup">Ready for pickup</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bayFilter ?? "all"} onValueChange={(value) => setBayFilter(value === "all" ? undefined : value)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter bay" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bays</SelectItem>
                {bays.map((bay) => (
                  <SelectItem key={bay.id} value={bay.id}>
                    {bay.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Active Vehicles</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {filteredTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge className={STATUS_COLORS[ticket.status] ?? "bg-muted text-muted-foreground"}>
                          {ticket.status.replace(/_/g, " ")}
                        </Badge>
                        <span>#{ticket.ticketNumber}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-semibold text-foreground">{ticket.customerName}</h3>
                      {ticket.vehicle && (
                        <p className="text-sm text-muted-foreground">{ticket.vehicle.year} {ticket.vehicle.make} {ticket.vehicle.model}</p>
                      )}
                      {ticket.promisedTime && (
                        <p className="text-xs text-muted-foreground">Promised {format(new Date(ticket.promisedTime), "MMM d, h:mm a")}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center justify-end gap-1">
                        <Clock3 className="h-3 w-3" /> {ticket.dropoffTime ? formatDistanceToNow(new Date(ticket.dropoffTime), { addSuffix: true }) : "—"}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <MapPin className="h-3 w-3" /> {ticket.bay?.label ?? "Unassigned"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" /> {ticket.services.length} services scheduled
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ticket.services.map((service) => (
                        <Badge key={service.servicePackage?.id ?? service.status} variant="outline">
                          {service.servicePackage?.name ?? service.status}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {canDispatch && (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <Select value={ticket.bay?.id ?? ""} onValueChange={(value) => handleStatusChange(ticket.id, ticket.status, value || undefined)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign bay" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Unassigned</SelectItem>
                          {bays.map((bay) => (
                            <SelectItem key={bay.id} value={bay.id}>
                              {bay.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select onValueChange={(value) => handleStatusChange(ticket.id, value, ticket.bay?.id)} value={ticket.status}>
                        <SelectTrigger>
                          <SelectValue placeholder="Update status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="awaiting_check_in">Awaiting check-in</SelectItem>
                          <SelectItem value="waiting_on_approval">Waiting approval</SelectItem>
                          <SelectItem value="waiting_parts">Waiting parts</SelectItem>
                          <SelectItem value="in_service">In service</SelectItem>
                          <SelectItem value="road_test">Road test</SelectItem>
                          <SelectItem value="ready_for_pickup">Ready for pickup</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
              {filteredTickets.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No vehicles meet your filters right now.</p>}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bay Utilization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {bays.map((bay) => (
                  <div key={bay.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{bay.label}</div>
                      <p className="text-xs text-muted-foreground">{bay.type} • {bay.features?.join(", ") ?? "Standard"}</p>
                    </div>
                    <Badge variant={bay.status === "available" ? "outline" : "default"} className="capitalize">
                      {bay.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
                {bays.length === 0 && <p>No bays configured yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lane Intelligence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <Gauge className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Balance bay load</p>
                    <p>Keep heavy diagnostics away from express lanes to avoid bottlenecks. Prioritize overdue promised times automatically.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <ListChecks className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Push inspection findings</p>
                    <p>Feed approved upsells directly into parts staging to trim ticket-to-bay cycle time by 15 minutes.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <Radio className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Notify proactively</p>
                    <p>Auto-text customers at key status transitions and elevate VIP clients to advisors instantly.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
