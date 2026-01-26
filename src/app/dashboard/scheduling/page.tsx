"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useShifts,
  useTeamMembers,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
} from "@/lib/hooks/use-graphql";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  CalendarClock,
  ClipboardCheck,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";

const WEEK_START_OPTIONS = { weekStartsOn: 1 } as const;

const TECHNICIAN_ROLES = [
  "Master Technician",
  "Diagnostic Specialist",
  "EV and Battery Tech",
  "Transmission Lead",
  "Service Advisor",
  "Parts Specialist",
  "Express Technician",
  "Shop Apprentice",
];

const SHIFT_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "on_hold",
  "cancelled",
];

const ROLE_COLORS: Record<string, string> = {
  "Master Technician": "bg-blue-100 text-blue-800",
  "Diagnostic Specialist": "bg-purple-100 text-purple-800",
  "EV and Battery Tech": "bg-emerald-100 text-emerald-800",
  "Transmission Lead": "bg-amber-100 text-amber-800",
  "Service Advisor": "bg-cyan-100 text-cyan-800",
  "Parts Specialist": "bg-rose-100 text-rose-800",
  "Express Technician": "bg-sky-100 text-sky-800",
  "Shop Apprentice": "bg-slate-100 text-slate-800",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-800",
  cancelled: "bg-rose-100 text-rose-800",
};

type ShiftInput = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  assignedTo: string;
  status?: string;
  notes?: string;
  breakTime?: number;
};

type ShiftFormState = ShiftInput & { isEditing?: boolean };

function createDefaultShift(date: string, technicians: Array<{ id: string }> = []): ShiftFormState {
  return {
    date,
    startTime: "08:00",
    endTime: "16:00",
    role: TECHNICIAN_ROLES[0] ?? "Master Technician",
    assignedTo: technicians[0]?.id ?? "",
    status: "scheduled",
    notes: "",
    breakTime: 30,
  };
}

function getWeekDays(start: Date) {
  return Array.from({ length: 7 }).map((_, idx) => addDays(start, idx));
}

function humanizeStatus(status?: string) {
  if (!status) return "Scheduled";
  return status
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (s) => s.toUpperCase());
}

function shiftKey(shift: { id?: string; date: string; startTime: string; assignedTo: string }) {
  return shift.id ?? `${shift.date}-${shift.startTime}-${shift.assignedTo}`;
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${startTime} – ${endTime}`;
}

export default function SchedulingPage() {
  const permissions = usePermissions();
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), WEEK_START_OPTIONS));
  const weekStart = useMemo(() => startOfWeek(weekAnchor, WEEK_START_OPTIONS), [weekAnchor]);
  const weekEnd = useMemo(() => endOfWeek(weekAnchor, WEEK_START_OPTIONS), [weekAnchor]);
  const startISO = format(weekStart, "yyyy-MM-dd");
  const endISO = format(weekEnd, "yyyy-MM-dd");

  const { data: shiftData, loading: shiftLoading, refetch: refetchShifts } = useShifts({ startDate: startISO, endDate: endISO });
  const { data: teamData, loading: teamLoading } = useTeamMembers();

  const [activeTab, setActiveTab] = useState<"week" | "technicians" | "capacity">("week");
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<ShiftFormState | null>(null);

  const [createShift, { loading: creating }] = useCreateShift();
  const [updateShift, { loading: updating }] = useUpdateShift();
  const [deleteShift, { loading: deleting }] = useDeleteShift();

  const technicians = useMemo(() => teamData?.teamMembers ?? [], [teamData]);
  const technicianMap = useMemo(() => {
    const map = new Map<string, any>();
    (teamData?.teamMembers ?? []).forEach((tech: any) => {
      const techId = tech.id ?? tech._id ?? tech.toastId ?? tech.email;
      if (techId) map.set(String(techId), tech);
    });
    return map;
  }, [teamData]);

  const shifts = useMemo(() => {
    const items = (shiftData?.shifts ?? []).map((shift: any) => ({
      ...shift,
      teamMember: shift.teamMember || technicianMap.get(String(shift.assignedTo)) || null,
    }));
    return items.sort((a: any, b: any) => {
      if (a.date === b.date) return a.startTime.localeCompare(b.startTime);
      return a.date.localeCompare(b.date);
    });
  }, [shiftData, technicianMap]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const shiftsByDay = useMemo(() => {
    return weekDays.map((day) => {
      const dateISO = format(day, "yyyy-MM-dd");
      const dayShifts = shifts.filter((shift: any) => shift.date === dateISO);
      return {
        date: day,
        shifts: dayShifts,
      };
    });
  }, [weekDays, shifts]);

  const bayCoverage = useMemo(() => {
    const result = new Map<string, number>();
    shifts.forEach((shift: any) => {
      const role = shift.role || "Technician";
      result.set(role, (result.get(role) ?? 0) + 1);
    });
    return Array.from(result.entries()).map(([role, count]) => ({ role, count }));
  }, [shifts]);

  const activeTechnicians = useMemo(() => {
    const todayISO = format(new Date(), "yyyy-MM-dd");
    const todaysShifts = shifts.filter((shift: any) => shift.date === todayISO && shift.status !== "cancelled");
    const unique = new Set<string>();
    todaysShifts.forEach((shift: any) => {
      const id = String(shift.assignedTo);
      if (id) unique.add(id);
    });
    return unique.size;
  }, [shifts]);

  const openCreateDialog = (date: Date) => {
    const iso = format(date, "yyyy-MM-dd");
    setFormState(createDefaultShift(iso, technicians));
    setDialogOpen(true);
  };

  const openEditDialog = (shift: any) => {
    setFormState({
      id: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      role: shift.role,
      assignedTo: String(shift.assignedTo),
      status: shift.status ?? "scheduled",
      notes: shift.notes ?? "",
      breakTime: shift.breakTime ?? 30,
      isEditing: true,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setFormState(null);
  };

  const handleSubmit = async () => {
    if (!formState) return;
    const hasId = Boolean(formState.id);
    const input: ShiftInput = {
      date: formState.date,
      startTime: formState.startTime,
      endTime: formState.endTime,
      role: formState.role,
      assignedTo: formState.assignedTo,
      notes: formState.notes,
    };
    try {
      if (hasId) {
        await updateShift({
          variables: {
            id: formState.id,
            input: {
              date: formState.date,
              startTime: formState.startTime,
              endTime: formState.endTime,
              role: formState.role,
              assignedTo: formState.assignedTo,
              status: formState.status,
              notes: formState.notes,
              breakTime: formState.breakTime,
            },
          },
        });
        toast.success("Shift updated");
      } else {
        await createShift({ variables: { input } });
        toast.success("Shift created");
      }
      closeDialog();
      refetchShifts();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Unable to save shift");
    }
  };

  const handleDelete = async () => {
    if (!formState?.id) return;
    try {
      await deleteShift({ variables: { id: formState.id } });
      toast.success("Shift removed");
      closeDialog();
      refetchShifts();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Unable to delete shift");
    }
  };

  const canManageScheduling = (permissions as any).canManageScheduling?.() ?? true;

  return (
    <DashboardLayout>
      <div className="space-y-8 p-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Technician Scheduling</h1>
            <p className="text-muted-foreground">Plan bay coverage, technician assignments, and advisor availability for the selected week.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setWeekAnchor(addDays(weekStart, -7))}>
              <CalendarClock className="mr-2 h-4 w-4" /> Previous Week
            </Button>
            <Button variant="outline" onClick={() => setWeekAnchor(new Date())}>Today</Button>
            <Button variant="default" onClick={() => setWeekAnchor(addDays(weekStart, 7))}>
              Next Week
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Technicians Today</CardTitle>
              <Wrench className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeTechnicians}</div>
              <p className="text-xs text-muted-foreground">Technicians clocked in or scheduled today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled Shifts</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{shifts.length}</div>
              <p className="text-xs text-muted-foreground">Total shifts planned for {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bay Coverage</CardTitle>
              <Gauge className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{bayCoverage.length}</div>
              <p className="text-xs text-muted-foreground">Unique service roles covered this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Up Next</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {(() => {
                const upcoming = shifts.find((shift: any) => {
                  const now = new Date();
                  const shiftDate = parseISO(shift.date);
                  return shift.status === "scheduled" && (isSameDay(now, shiftDate) || shiftDate > now);
                });
                if (!upcoming) {
                  return <p className="text-sm text-muted-foreground">All caught up – no remaining shifts today.</p>;
                }
                const tech = upcoming.teamMember?.name ?? "Unassigned";
                return (
                  <div className="space-y-1">
                    <div className="text-md font-semibold">{formatTimeRange(upcoming.startTime, upcoming.endTime)}</div>
                    <p className="text-sm text-muted-foreground">{upcoming.role} • {tech}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="week">Week Schedule</TabsTrigger>
            <TabsTrigger value="technicians">Technician Roster</TabsTrigger>
            <TabsTrigger value="capacity">Bay Capacity</TabsTrigger>
          </TabsList>

          <TabsContent value="week" className="mt-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle>Week of {format(weekStart, "MMMM d, yyyy")}</CardTitle>
                  <CardDescription>Drag through the timeline to review coverage or add assignments per bay.</CardDescription>
                </div>
                {canManageScheduling && (
                  <Button onClick={() => openCreateDialog(weekStart)}>
                    <Plus className="mr-2 h-4 w-4" /> New Shift
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {shiftLoading ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed py-10 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading shifts...
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {shiftsByDay.map(({ date, shifts: dayShifts }) => (
                      <div key={date.toISOString()} className="rounded-lg border bg-card/50 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase text-muted-foreground">{format(date, "EEEE")}</p>
                            <h3 className="text-lg font-semibold">{format(date, "MMM d")}</h3>
                          </div>
                          {canManageScheduling && (
                            <Button variant="outline" size="sm" onClick={() => openCreateDialog(date)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="mt-3 space-y-3">
                          {dayShifts.length === 0 && (
                            <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                              No assignments yet.
                            </div>
                          )}
                          {dayShifts.map((shift: any) => {
                            const color = ROLE_COLORS[shift.role] ?? "bg-primary/10 text-primary";
                            const statusColor = STATUS_COLORS[shift.status ?? "scheduled"] ?? STATUS_COLORS.scheduled;
                            return (
                              <button
                                key={shiftKey(shift)}
                                type="button"
                                onClick={() => canManageScheduling && openEditDialog(shift)}
                                className="w-full rounded-lg border bg-background p-3 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold ${color}`}>
                                    {shift.role}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                                    {humanizeStatus(shift.status)}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm font-medium">{formatTimeRange(shift.startTime, shift.endTime)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {shift.teamMember?.name ?? "Unassigned"}
                                </p>
                                {shift.notes && <p className="mt-2 text-xs text-muted-foreground">{shift.notes}</p>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="technicians" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Technician roster</CardTitle>
                <CardDescription>Comprehensive list of every team member along with specialty, certifications, and availability.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {technicians.map((tech: any) => {
                  const initials = tech.name.split(" ").map((part: string) => part[0]).join("");
                  return (
                    <div key={tech.id ?? tech.email} className="flex items-start gap-3 rounded-lg border bg-card/60 p-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold leading-tight">{tech.name}</h3>
                          <Badge variant="outline">{tech.department ?? "Technician"}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{tech.role}</p>
                        <div className="flex flex-wrap gap-1">
                          {(tech.skills ?? []).slice(0, 4).map((skill: string) => (
                            <Badge key={skill} variant="secondary" className="bg-muted text-muted-foreground">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Rating {tech.performance?.rating?.toFixed?.(1) ?? "--"}</span>
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {tech.availability}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {teamLoading && (
                  <div className="col-span-full flex items-center justify-center rounded-lg border border-dashed py-10 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading roster...
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="capacity" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Bay capacity & role distribution</CardTitle>
                <CardDescription>Ensure each service lane has proper coverage by reviewing shifts per specialization.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {bayCoverage.map(({ role, count }) => (
                  <div key={role} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"}`}>
                        {role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{count} shift{count === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                ))}
                {bayCoverage.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                    Add shifts to see bay capacity analytics.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{formState?.isEditing ? "Update shift" : "Create shift"}</DialogTitle>
              <DialogDescription>Configure the technician assignment, bay, and timing for this shift.</DialogDescription>
            </DialogHeader>
            {formState && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formState.date}
                    onChange={(event) => setFormState((prev) => prev ? { ...prev, date: event.target.value } : prev)}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="startTime">Start time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formState.startTime}
                      onChange={(event) => setFormState((prev) => prev ? { ...prev, startTime: event.target.value } : prev)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endTime">End time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={formState.endTime}
                      onChange={(event) => setFormState((prev) => prev ? { ...prev, endTime: event.target.value } : prev)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Select
                    value={formState.role}
                    onValueChange={(value) => setFormState((prev) => prev ? { ...prev, role: value } : prev)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {TECHNICIAN_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Assigned technician</Label>
                  <Select
                    value={formState.assignedTo}
                    onValueChange={(value) => setFormState((prev) => prev ? { ...prev, assignedTo: value } : prev)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((tech: any) => (
                        <SelectItem key={tech.id ?? tech.email} value={String(tech.id ?? tech.email)}>
                          {tech.name} — {tech.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={formState.status ?? "scheduled"}
                    onValueChange={(value) => setFormState((prev) => prev ? { ...prev, status: value } : prev)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {humanizeStatus(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
                    value={formState.notes ?? ""}
                    onChange={(event) => setFormState((prev) => prev ? { ...prev, notes: event.target.value } : prev)}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {formState?.isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleting || updating}
                  className="text-rose-600 hover:text-rose-600"
                >
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />} Delete shift
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={creating || updating}>
                  {(creating || updating) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {formState?.isEditing ? "Save changes" : "Create shift"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
