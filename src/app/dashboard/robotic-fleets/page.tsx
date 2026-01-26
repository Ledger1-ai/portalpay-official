"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useAutomationAssets,
  useCreateAutomationAsset,
  useUpdateAutomationAsset,
  useServiceBays,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity,
  Battery,
  Bot,
  CheckCircle,
  Plus,
  Radio,
  Waves,
  Wrench,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AssetFormState {
  id?: string;
  name: string;
  type: string;
  status: string;
  zone?: string;
  manufacturer?: string;
  modelNumber?: string;
  assignedBayId?: string;
  utilizationRate?: number;
  firmwareVersion?: string;
  nextServiceDate?: string;
  notes?: string;
}

const ASSET_TYPES = [
  "Autonomous Tool Cart",
  "EV Charger",
  "Calibration System",
  "Parts Locker",
  "Shop Drone",
  "Inspection Scanner",
  "Tire Robot",
  "Fluid Station",
];

const STATUS_COLORS: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-700",
  offline: "bg-rose-100 text-rose-700",
  maintenance: "bg-amber-100 text-amber-700",
  degraded: "bg-sky-100 text-sky-700",
};

function createEmptyAssetForm(): AssetFormState {
  return {
    name: "",
    type: ASSET_TYPES[0] ?? "Autonomous Tool Cart",
    status: "online",
    zone: "Service Core",
  };
}

export default function AutomationFleetPage() {
  const permissions = usePermissions();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<AssetFormState>(createEmptyAssetForm);

  const { data: assetsData, refetch: refetchAssets } = useAutomationAssets();
  const { data: baysData } = useServiceBays({ includeOutOfService: true });
  const [createAsset, { loading: creating }] = useCreateAutomationAsset();
  const [updateAsset, { loading: updating }] = useUpdateAutomationAsset();

  const assets = assetsData?.automationAssets ?? [];
  const bays = baysData?.serviceBays ?? [];
  const canManage = permissions["robotic-fleets"];

  const criticalAssets = useMemo(() => assets.filter((asset) => asset.status === "degraded" || asset.status === "maintenance"), [assets]);

  const handleOpenCreate = () => {
    setFormState(createEmptyAssetForm());
    setIsFormOpen(true);
  };

  const handleEditAsset = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    setFormState({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      zone: asset.zone,
      manufacturer: asset.manufacturer,
      modelNumber: asset.modelNumber,
      assignedBayId: asset.assignedBay?.id,
      utilizationRate: asset.utilizationRate,
      firmwareVersion: asset.firmwareVersion,
      nextServiceDate: asset.nextServiceDate ? asset.nextServiceDate.slice(0, 10) : undefined,
      notes: asset.notes,
    });
    setIsFormOpen(true);
  };

  const handleSubmitAsset = async () => {
    if (!formState.name) {
      toast.error("Asset name is required");
      return;
    }
    try {
      if (formState.id) {
        await updateAsset({
          variables: {
            id: formState.id,
            status: formState.status,
            utilizationRate: formState.utilizationRate ?? null,
            firmwareVersion: formState.firmwareVersion ?? null,
            nextServiceDate: formState.nextServiceDate ?? null,
            notes: formState.notes ?? null,
          },
        });
        toast.success("Asset updated");
      } else {
        await createAsset({
          variables: {
            name: formState.name,
            type: formState.type,
            zone: formState.zone,
            assignedBay: formState.assignedBayId,
            status: formState.status,
            manufacturer: formState.manufacturer,
            modelNumber: formState.modelNumber,
          },
        });
        toast.success("Asset added");
      }
      setIsFormOpen(false);
      await refetchAssets();
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to save automation asset");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Automation & Equipment</h1>
            <p className="text-muted-foreground">Monitor robotics, chargers, and digital equipment health in real time. Keep uptime high and service time low.</p>
          </div>
          {canManage && (
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" /> Register Asset
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Fleet Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {assets.map((asset) => (
                <div key={asset.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge className={STATUS_COLORS[asset.status] ?? "bg-muted text-muted-foreground"}>{asset.status}</Badge>
                      <h3 className="mt-2 text-lg font-semibold text-foreground">{asset.name}</h3>
                      <p className="text-xs text-muted-foreground">{asset.type}</p>
                      {asset.zone && <p className="text-xs text-muted-foreground">Zone {asset.zone}</p>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {asset.lastHeartbeat && <p>Heartbeat {formatDistanceToNow(new Date(asset.lastHeartbeat), { addSuffix: true })}</p>}
                      {asset.nextServiceDate && <p>Next service {formatDistanceToNow(new Date(asset.nextServiceDate), { addSuffix: true })}</p>}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-md bg-muted/60 p-2">
                      <p className="uppercase">Utilization</p>
                      <p className="text-foreground">{asset.utilizationRate?.toFixed(0) ?? 0}%</p>
                    </div>
                    <div className="rounded-md bg-muted/60 p-2">
                      <p className="uppercase">Health</p>
                      <p className="text-foreground">{asset.healthScore?.toFixed(0) ?? 0}%</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-3 w-3" /> {asset.assignedBay?.label ?? "Unassigned"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Battery className="h-3 w-3" /> {asset.connectedDevices ?? 0} connected
                    </div>
                  </div>
                  {canManage && (
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditAsset(asset.id)}>
                        Manage
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenCreate()}>
                        Clone
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {assets.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No automation assets registered yet.</p>}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Critical Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {criticalAssets.length === 0 && <p>All systems nominal.</p>}
                {criticalAssets.map((asset) => (
                  <div key={asset.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <Radio className="mt-0.5 h-4 w-4 text-rose-500" />
                    <div>
                      <p className="font-semibold text-foreground">{asset.name}</p>
                      <p>Status {asset.status.replace(/_/g, " ")}. Utilization {asset.utilizationRate?.toFixed(0) ?? 0}%.</p>
                      {asset.nextServiceDate && <p className="text-xs">Service overdue in {formatDistanceToNow(new Date(asset.nextServiceDate))}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Automation Playbook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <Bot className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Keep firmware unified</p>
                    <p>Schedule rolling firmware pushes after close and verify heartbeats before opening.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <Activity className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Blend with bay dispatch</p>
                    <p>Assign autonomous carts to bays automatically when ticket status changes to in_service.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Automate compliance</p>
                    <p>Log EV charger output and calibration dates so the audit trail is audit-ready.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? "Update Asset" : "Register Asset"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formState.type} onValueChange={(value) => setFormState((prev) => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="degraded">Degraded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <Input value={formState.zone ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, zone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Assigned Bay</Label>
              <Select value={formState.assignedBayId ?? ""} onValueChange={(value) => setFormState((prev) => ({ ...prev, assignedBayId: value || undefined }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bay" />
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
            </div>
            <div className="space-y-2">
              <Label>Manufacturer</Label>
              <Input value={formState.manufacturer ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, manufacturer: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Model Number</Label>
              <Input value={formState.modelNumber ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, modelNumber: event.target.value }))} />
            </div>
            {formState.id && (
              <>
                <div className="space-y-2">
                  <Label>Utilization (%)</Label>
                  <Input type="number" value={formState.utilizationRate ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, utilizationRate: event.target.value ? Number(event.target.value) : undefined }))} />
                </div>
                <div className="space-y-2">
                  <Label>Firmware Version</Label>
                  <Input value={formState.firmwareVersion ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, firmwareVersion: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Next Service Date</Label>
                  <Input type="date" value={formState.nextServiceDate ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, nextServiceDate: event.target.value }))} />
                </div>
              </>
            )}
            <div className="md:col-span-2 space-y-2">
              <Label>Notes</Label>
              <Input value={formState.notes ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Maintenance notes or safety considerations" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitAsset} disabled={creating || updating}>{formState.id ? "Save Changes" : "Create Asset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
