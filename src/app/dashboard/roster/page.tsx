"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
// @ts-ignore
// @ts-ignore
import { gql } from "@apollo/client";
// @ts-ignore
import { useMutation, useQuery } from "@apollo/client/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const GET_ROSTER_DATA = gql`
  query RosterData($includeToastOnly: Boolean, $onlySevenShiftsActive: Boolean) {
    rosterCandidates(includeToastOnly: $includeToastOnly, onlySevenShiftsActive: $onlySevenShiftsActive) {
      id
      name
      email
      role
      department
      toastEnrolled
      sevenShiftsEnrolled
      rating
    }
    rosterConfigurations {
      id
      name
      description
      isActive
      nodes { id name department stratum capacity assigned { userId source displayName rating } children { id name department stratum capacity assigned { userId source displayName rating } } }
      createdAt
      updatedAt
    }
    activeRosterConfiguration { id name isActive }
  }
`;

const CREATE_ROSTER = gql`
  mutation CreateRoster($input: CreateRosterInput!) {
    createRosterConfiguration(input: $input) { id name isActive }
  }
`;

const UPDATE_ROSTER = gql`
  mutation UpdateRoster($id: ID!, $input: UpdateRosterInput!) {
    updateRosterConfiguration(id: $id, input: $input) { id name isActive }
  }
`;

const SET_ACTIVE_ROSTER = gql`
  mutation SetActiveRoster($id: ID!) {
    setActiveRosterConfiguration(id: $id) { id name isActive }
  }
`;

type Stratum = "ADMIN" | "BOH" | "FOH";

type Candidate = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  department?: string;
  toastEnrolled: boolean;
  sevenShiftsEnrolled: boolean;
  rating?: number;
};

type Assignment = {
  userId: string;
  source: "TOAST" | "SEVEN_SHIFTS";
  displayName?: string;
  rating?: number;
};

type Node = {
  id: string;
  name: string;
  department: string;
  stratum: Stratum;
  capacity: number;
  assigned: Assignment[];
  children?: Node[];
};

const PRESETS: { key: string; name: string; description: string; nodes: Node[] }[] = [
  {
    key: "full_service",
    name: "Full Service Shop",
    description: "Leadership, Service Bays, Diagnostics, Parts",
    nodes: [
      { id: "leadership", name: "Shop Leadership", department: "Leadership", stratum: "ADMIN", capacity: 2, assigned: [] },
      {
        id: "service_ops",
        name: "Service Operations",
        department: "Service Bays",
        stratum: "BOH",
        capacity: 0,
        assigned: [],
        children: [
          { id: "master-techs", name: "Master Technicians", department: "Service Bays", stratum: "BOH", capacity: 2, assigned: [] },
          { id: "diagnostics", name: "Diagnostics Pod", department: "Diagnostics", stratum: "BOH", capacity: 2, assigned: [] },
          { id: "ev-specialists", name: "EV Specialists", department: "Service Bays", stratum: "BOH", capacity: 1, assigned: [] }
        ]
      },
      {
        id: "customer-ops",
        name: "Customer Operations",
        department: "Service Lane",
        stratum: "FOH",
        capacity: 0,
        assigned: [],
        children: [
          { id: "advisors", name: "Service Advisors", department: "Service Lane", stratum: "FOH", capacity: 3, assigned: [] },
          { id: "valet", name: "Concierge & Valet", department: "Service Lane", stratum: "FOH", capacity: 2, assigned: [] },
          { id: "quality", name: "Quality Inspectors", department: "Service Lane", stratum: "FOH", capacity: 1, assigned: [] }
        ]
      },
      {
        id: "parts-counter",
        name: "Parts & Logistics",
        department: "Parts",
        stratum: "BOH",
        capacity: 0,
        assigned: [],
        children: [
          { id: "counter", name: "Parts Counter", department: "Parts", stratum: "BOH", capacity: 2, assigned: [] },
          { id: "staging", name: "Staging & Pre-Pick", department: "Parts", stratum: "BOH", capacity: 2, assigned: [] }
        ]
      }
    ]
  },
  {
    key: "express",
    name: "Express Service Lane",
    description: "Leadership, Express Bays, Customer Experience",
    nodes: [
      { id: "express-lead", name: "Service Lead", department: "Leadership", stratum: "ADMIN", capacity: 1, assigned: [] },
      {
        id: "express-bays",
        name: "Express Bays",
        department: "Service Bays",
        stratum: "BOH",
        capacity: 0,
        assigned: [],
        children: [
          { id: "express-techs", name: "Express Techs", department: "Service Bays", stratum: "BOH", capacity: 3, assigned: [] },
          { id: "inspection", name: "Inspection Team", department: "Diagnostics", stratum: "BOH", capacity: 1, assigned: [] }
        ]
      },
      {
        id: "customer-lounge",
        name: "Customer Lounge",
        department: "Service Lane",
        stratum: "FOH",
        capacity: 0,
        assigned: [],
        children: [
          { id: "greeters", name: "Vehicle Greeters", department: "Service Lane", stratum: "FOH", capacity: 2, assigned: [] },
          { id: "liaisons", name: "Customer Liaisons", department: "Service Lane", stratum: "FOH", capacity: 2, assigned: [] }
        ]
      }
    ]
  }
];


const STRATUM_LABELS: Record<Stratum, string> = {
  ADMIN: "Leadership",
  BOH: "Shop Operations",
  FOH: "Customer Experience",
};
function flattenNodes(nodes: Node[]): Node[] {
  const list: Node[] = [];
  const walk = (n: Node) => {
    list.push(n);
    (n.children || []).forEach(walk);
  };
  nodes.forEach(walk);
  return list;
}

function computeRatings(nodes: Node[]) {
  const flat = flattenNodes(nodes);
  const deptMap: Record<string, { sum: number; count: number }> = {};
  let total = 0, count = 0;
  flat.forEach(n => {
    const r = n.assigned.reduce((acc, a) => acc + (a.rating || 0), 0);
    const c = n.assigned.length;
    if (!deptMap[n.department]) deptMap[n.department] = { sum: 0, count: 0 };
    deptMap[n.department].sum += r;
    deptMap[n.department].count += c;
    total += r; count += c;
  });
  const byDepartment = Object.entries(deptMap).map(([department, v]) => ({ department, rating: v.count ? (v.sum / v.count) : 0 }));
  const overall = count ? (total / count) : 0;
  return { byDepartment, overall };
}

export default function RosterPage() {
  const [onlySevenShifts, setOnlySevenShifts] = useState(true);
  const [includeToastOnly, setIncludeToastOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESETS[0].key);
  const [nodes, setNodes] = useState<Node[]>(PRESETS[0].nodes);
  const [configName, setConfigName] = useState("");

  const { data, refetch } = useQuery<any, any>(GET_ROSTER_DATA, {
    variables: { includeToastOnly, onlySevenShiftsActive: onlySevenShifts },
    fetchPolicy: "cache-and-network",
  });

  const [createRoster] = useMutation(CREATE_ROSTER, { onCompleted: () => { toast.success("Roster saved"); refetch(); } });
  const [updateRoster] = useMutation(UPDATE_ROSTER, { onCompleted: () => { toast.success("Roster updated"); refetch(); } });
  const [setActive] = useMutation(SET_ACTIVE_ROSTER, { onCompleted: () => { toast.success("Active roster set"); refetch(); } });

  const candidates: Candidate[] = data?.rosterCandidates || [];
  const configurations = data?.rosterConfigurations || [];
  const active = data?.activeRosterConfiguration?.id || null;

  useEffect(() => {
    const preset = PRESETS.find(p => p.key === selectedPreset);
    if (preset) setNodes(JSON.parse(JSON.stringify(preset.nodes)) as Node[]);
  }, [selectedPreset]);

  const onDragStart = useCallback((e: React.DragEvent, cand: Candidate) => {
    e.dataTransfer.setData("application/json", JSON.stringify(cand));
  }, []);

  const onDropOnNode = useCallback((e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    const cand: Candidate = JSON.parse(e.dataTransfer.getData("application/json"));
    setNodes(prev => {
      const clone: Node[] = JSON.parse(JSON.stringify(prev));
      const all = flattenNodes(clone);
      const node = all.find(n => n.id === nodeId);
      if (!node) return prev;
      if (node.capacity && node.assigned.length >= node.capacity) {
        toast.error("Capacity reached for this node");
        return prev;
      }
      if (node.assigned.some(a => a.userId === cand.id)) return prev;
      node.assigned.push({ userId: cand.id, source: cand.sevenShiftsEnrolled ? "SEVEN_SHIFTS" : "TOAST", displayName: cand.name, rating: cand.rating || 0 });
      return clone;
    });
  }, []);

  const onRemoveFromNode = useCallback((nodeId: string, userId: string) => {
    setNodes(prev => {
      const clone: Node[] = JSON.parse(JSON.stringify(prev));
      const all = flattenNodes(clone);
      const node = all.find(n => n.id === nodeId);
      if (!node) return prev;
      node.assigned = node.assigned.filter(a => a.userId !== userId);
      return clone;
    });
  }, []);

  const ratings = useMemo(() => computeRatings(nodes), [nodes]);

  const handleSave = async () => {
    if (!configName.trim()) {
      toast.error("Please enter a name for the configuration");
      return;
    }
    await createRoster({ variables: { input: { name: configName.trim(), description: "Auto shop deployment", nodes } } });
    setConfigName("");
  };

  const handleSetActive = async (id: string) => {
    await setActive({ variables: { id } });
  };

  const toggleOnlySevenShifts = () => setOnlySevenShifts(v => !v);
  const toggleIncludeToastOnly = () => setIncludeToastOnly(v => !v);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant={onlySevenShifts ? "default" : "outline"} onClick={toggleOnlySevenShifts}>Only ShiftSync connected</Button>
          <Button variant={includeToastOnly ? "default" : "outline"} onClick={toggleIncludeToastOnly}>Include manual staff</Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPreset} onValueChange={setSelectedPreset}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Select preset" /></SelectTrigger>
            <SelectContent>
              {PRESETS.map(p => (<SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Input placeholder="Configuration name" value={configName} onChange={(e) => setConfigName(e.target.value)} className="w-[240px]" />
          <Button onClick={handleSave}>Save Configuration</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Card className="p-3">
          <div className="text-sm font-medium">Average Proficiency</div>
          <div className="text-2xl font-semibold">{ratings.overall.toFixed(2)}</div>
        </Card>
        {ratings.byDepartment.map(d => (
          <Card key={d.department} className="p-3">
            <div className="text-sm font-medium">{d.department || 'Unknown'} Score</div>
            <div className="text-xl font-semibold">{d.rating.toFixed(2)}</div>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="tree">Tree View</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Talent Pool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {candidates.map(c => (
                  <div key={c.id} draggable onDragStart={(e) => onDragStart(e, c)} className="p-2 border rounded flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.role || '--'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div title="ShopOps Cloud" className={`w-2.5 h-2.5 rounded-full ${c.toastEnrolled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <div title="ShiftSync" className={`w-2.5 h-2.5 rounded-full ${c.sevenShiftsEnrolled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <Badge variant="secondary">{(c.rating || 0).toFixed(1)}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Work Centers</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {flattenNodes(nodes).filter(n => !n.children || n.children.length === 0).map(n => (
                  <div key={n.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropOnNode(e, n.id)} className="p-3 border rounded min-h-[100px]">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{n.name}</div>
                      <Badge variant="outline">{n.assigned.length}/{n.capacity ?? '--'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">{`${n.department} / ${STRATUM_LABELS[n.stratum] ?? n.stratum}`}</div>
                    <div className="flex flex-wrap gap-2">
                      {n.assigned.map(a => (
                        <Badge key={a.userId} className="gap-1" onClick={() => onRemoveFromNode(n.id, a.userId)}>
                          {a.displayName || a.userId} <span className="opacity-60">({(a.rating || 0).toFixed(1)})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tree">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Talent Pool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {candidates.map(c => (
                  <div key={c.id} draggable onDragStart={(e) => onDragStart(e, c)} className="p-2 border rounded flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.role || '--'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div title="ShopOps Cloud" className={`w-2.5 h-2.5 rounded-full ${c.toastEnrolled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <div title="ShiftSync" className={`w-2.5 h-2.5 rounded-full ${c.sevenShiftsEnrolled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <Badge variant="secondary">{(c.rating || 0).toFixed(1)}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Deployment Tree</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {nodes.map(root => (
                    <TreeNode key={root.id} node={root} onDropOnNode={onDropOnNode} onRemove={onRemoveFromNode} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Select onValueChange={(id) => handleSetActive(id)}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Set active configuration" /></SelectTrigger>
              <SelectContent>
                {configurations.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} {c.id === active ? '(Active)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TreeNode({ node, onDropOnNode, onRemove }: { node: Node; onDropOnNode: (e: React.DragEvent, id: string) => void; onRemove: (nodeId: string, userId: string) => void }) {
  return (
    <div className="border rounded p-3">
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropOnNode(e, node.id)}>
        <div className="flex items-center justify-between">
          <div className="font-semibold">{node.name}</div>
          <Badge variant="outline">{node.assigned.length}/{node.capacity ?? '--'}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mb-2">{`${node.department} / ${STRATUM_LABELS[node.stratum] ?? node.stratum}`}</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {node.assigned.map(a => (
            <Badge key={a.userId} className="gap-1" onClick={() => onRemove(node.id, a.userId)}>
              {a.displayName || a.userId} <span className="opacity-60">({(a.rating || 0).toFixed(1)})</span>
            </Badge>
          ))}
        </div>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="ml-4 space-y-3">
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} onDropOnNode={onDropOnNode} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}


