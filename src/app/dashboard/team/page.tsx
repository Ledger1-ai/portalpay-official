"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useTeamMembers, useShifts } from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import {
  Activity,
  BadgeCheck,
  Car,
  ClipboardCheck,
  Filter,
  Gauge,
  Search,
  Sparkles,
} from "lucide-react";

const DEPARTMENTS = ["Service Bays", "Diagnostics", "Front Desk", "Parts", "Detail", "Field Service", "Management"];
const AVAILABILITY_COLORS: Record<string, string> = {
  "Full-time": "bg-emerald-100 text-emerald-700",
  "Part-time": "bg-sky-100 text-sky-700",
  Apprentice: "bg-amber-100 text-amber-700",
  "On-call": "bg-slate-200 text-slate-900",
};

export default function TeamPage() {
  const permissions = usePermissions();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [search, setSearch] = useState("");

  const { data: teamData } = useTeamMembers();
  const { data: shiftsData } = useShifts({});
  const teamMembers = teamData?.teamMembers ?? [];
  const shifts = shiftsData?.shifts ?? [];

  const filteredTeam = useMemo(() => {
    return teamMembers.filter((member) => {
      if (departmentFilter && member.department !== departmentFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        if (!member.name.toLowerCase().includes(term) && !(member.role || "").toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [teamMembers, departmentFilter, search]);

  const activeShifts = shifts.filter((shift) => shift.status === "active");

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Shop Team</h1>
            <p className="text-muted-foreground">Track technician readiness, credentials, and live assignments. Elevate the right talent at the right time.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team" className="pl-9" />
            </div>
            <Select value={departmentFilter ?? "all"} onValueChange={(value) => setDepartmentFilter(value === "all" ? undefined : value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {DEPARTMENTS.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Live Shift Board</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeShifts.map((shift) => (
              <div key={shift.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{shift.assignedTo?.name?.slice(0, 2).toUpperCase() ?? "TM"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{shift.assignedTo?.name ?? "Team Member"}</p>
                    <p className="text-xs text-muted-foreground">{shift.role}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {format(new Date(shift.date), "MMM d, yyyy")} • {shift.startTime} – {shift.endTime}
                  </span>
                  <Badge variant="outline">{shift.status}</Badge>
                </div>
              </div>
            ))}
            {activeShifts.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No active shifts right now.</p>}
          </CardContent>
        </Card>

        <Tabs defaultValue="roster">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="credentials">Certifications</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="roster" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTeam.map((member) => (
                <Card key={member.id} className="border-border">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg font-semibold text-foreground">{member.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Badge className={AVAILABILITY_COLORS[member.availability] ?? "bg-muted text-muted-foreground"}>{member.availability}</Badge>
                      <Badge variant="outline">{member.department}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="uppercase">Joined</p>
                        <p className="text-foreground">{format(new Date(member.joinDate), "MMM d, yyyy")}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="uppercase">Rate</p>
                        <p className="text-foreground">${member.hourlyRate.toFixed(2)}/hr</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Skills</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(member.skills ?? []).map((skill) => (
                          <Badge key={skill} variant="outline" className="text-[10px]">
                            {skill}
                          </Badge>
                        ))}
                        {(!member.skills || member.skills.length === 0) && <span>—</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Car className="h-3 w-3" /> Completed shifts {member.performance?.completedShifts ?? 0}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredTeam.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No team members match your filters.</p>}
            </div>
          </TabsContent>
          <TabsContent value="credentials" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Certifications & ASE Progress</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {teamMembers.map((member) => (
                  <div key={member.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      <Badge variant="outline">{member.performance?.aseCertifications?.length ?? 0} ASE</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(member.performance?.aseCertifications ?? []).map((cert) => (
                        <Badge key={cert} variant="outline">
                          {cert}
                        </Badge>
                      ))}
                      {(!member.performance?.aseCertifications || member.performance?.aseCertifications.length === 0) && <span className="text-muted-foreground">No certifications logged.</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {teamMembers.map((member) => (
                <Card key={member.id} className="border-border">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <Avatar>
                      <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">{member.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{member.department}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Rating</span>
                      <Badge variant="outline">{member.performance?.rating?.toFixed(1) ?? "—"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>On-time Rate</span>
                      <span>{member.performance?.onTimeRate?.toFixed(0) ?? 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Comebacks</span>
                      <span>{member.performance?.comebacks ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Upsell Capture</span>
                      <span>{member.performance?.upsellCaptureRate?.toFixed(0) ?? 0}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
