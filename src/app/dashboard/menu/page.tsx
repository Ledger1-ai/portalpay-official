"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useServicePackages,
  useServicePackage,
  useCreateServicePackage,
  useUpdateServicePackage,
  useDeleteServicePackage,
  useInventoryItems,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Brain,
  ClipboardCheck,
  Gauge,
  Hammer,
  Plus,
  Search,
  Shield,
  RefreshCcw,
  Sparkles,
  Wrench,
} from "lucide-react";

const SERVICE_CATEGORIES = [
  "Preventive Maintenance",
  "Diagnostics",
  "Powertrain",
  "Electrical",
  "Braking",
  "Suspension",
  "HVAC",
  "Tires",
  "Detailing",
  "Performance",
  "Fleet Service",
  "Inspection",
  "Restoration",
];

const BAY_TYPES = [
  "General",
  "Heavy Duty",
  "Alignment",
  "Express",
  "Diagnostic",
  "EV Specialized",
  "Detail",
];

const SKILL_LEVELS = ["Apprentice", "Intermediate", "Advanced", "Master"];

interface ServiceFormState {
  id?: string;
  serviceCode: string;
  name: string;
  shortName?: string;
  category: string;
  subcategory?: string;
  description?: string;
  detailedSteps: string;
  laborHours: number;
  basePrice: number;
  bayType: string;
  skillLevel: string;
  warrantyMonths?: number;
  serviceIntervalMiles?: number;
  serviceIntervalMonths?: number;
  sameDayEligible: boolean;
  isSeasonal: boolean;
  isFeatured: boolean;
  safetyNotes?: string;
  requiredEquipment: string;
  upsellRecommendations: string;
  inspectionChecklist: string;
  recommendedParts: Array<{ partId: string; quantity: number; unit: string; note?: string }>;
}

function createEmptyServiceForm(): ServiceFormState {
  return {
    serviceCode: "",
    name: "",
    category: SERVICE_CATEGORIES[0] ?? "Preventive Maintenance",
    detailedSteps: "",
    laborHours: 1.5,
    basePrice: 189,
    bayType: BAY_TYPES[0] ?? "General",
    skillLevel: SKILL_LEVELS[1] ?? "Intermediate",
    sameDayEligible: true,
    isSeasonal: false,
    isFeatured: false,
    requiredEquipment: "",
    upsellRecommendations: "",
    inspectionChecklist: "",
    recommendedParts: [],
  };
}
export default function ServiceCatalogPage() {
  const permissions = usePermissions();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>();
  const [formState, setFormState] = useState<ServiceFormState>(createEmptyServiceForm);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: listData, refetch: refetchPackages } = useServicePackages({
    category: activeCategory,
    search,
  });
  const { data: detailData, refetch: refetchDetail } = useServicePackage(selectedPackageId);
  const { data: inventoryData } = useInventoryItems({ pagination: { page: 1, pageSize: 100 } });

  const [createServicePackage, { loading: creating }] = useCreateServicePackage();
  const [updateServicePackage, { loading: updating }] = useUpdateServicePackage();
  const [deleteServicePackage, { loading: deleting }] = useDeleteServicePackage();

  const packages = listData?.servicePackages ?? [];
  const activePackage = detailData?.servicePackage ?? null;
  const inventoryItems = inventoryData?.inventoryItems.items ?? [];
  const canManageCatalog = (permissions as any).menu;

  const handleOpenCreate = () => {
    setFormState(createEmptyServiceForm());
    setSelectedPackageId(undefined);
    setIsFormOpen(true);
  };

  const handleEditPackage = (id: string) => {
    const pkg = packages.find((p) => p.id === id) || activePackage;
    if (!pkg) return;
    setFormState({
      id: pkg.id,
      serviceCode: pkg.serviceCode,
      name: pkg.name,
      shortName: pkg.shortName,
      category: pkg.category,
      subcategory: pkg.subcategory,
      description: pkg.description,
      detailedSteps: (pkg.detailedSteps ?? []).join("\n"),
      laborHours: pkg.laborHours,
      basePrice: pkg.basePrice,
      bayType: pkg.bayType,
      skillLevel: pkg.skillLevel,
      warrantyMonths: pkg.warrantyMonths ?? undefined,
      serviceIntervalMiles: pkg.serviceIntervalMiles ?? undefined,
      serviceIntervalMonths: pkg.serviceIntervalMonths ?? undefined,
      sameDayEligible: pkg.sameDayEligible,
      isSeasonal: pkg.isSeasonal,
      isFeatured: pkg.isFeatured,
      safetyNotes: pkg.safetyNotes ?? "",
      requiredEquipment: (pkg.requiredEquipment ?? []).join("\n"),
      upsellRecommendations: (pkg.upsellRecommendations ?? []).join("\n"),
      inspectionChecklist: (pkg.inspectionChecklist ?? []).join("\n"),
      recommendedParts: (pkg.recommendedParts ?? []).map((rec) => ({
        partId: rec.part?.id ?? "",
        quantity: rec.quantity ?? 1,
        unit: rec.unit ?? "each",
        note: rec.note ?? "",
      })),
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = async () => {
    if (!formState.name || !formState.serviceCode) {
      toast.error("Service code and name are required");
      return;
    }
    try {
      const payload = {
        serviceCode: formState.serviceCode,
        name: formState.name,
        shortName: formState.shortName,
        category: formState.category,
        subcategory: formState.subcategory,
        description: formState.description,
        detailedSteps: formState.detailedSteps
          .split("\n")
          .map((step) => step.trim())
          .filter(Boolean),
        laborHours: Number(formState.laborHours),
        basePrice: Number(formState.basePrice),
        bayType: formState.bayType,
        skillLevel: formState.skillLevel,
        warrantyMonths: formState.warrantyMonths ? Number(formState.warrantyMonths) : null,
        serviceIntervalMiles: formState.serviceIntervalMiles ? Number(formState.serviceIntervalMiles) : null,
        serviceIntervalMonths: formState.serviceIntervalMonths ? Number(formState.serviceIntervalMonths) : null,
        sameDayEligible: formState.sameDayEligible,
        isSeasonal: formState.isSeasonal,
        isFeatured: formState.isFeatured,
        safetyNotes: formState.safetyNotes,
        requiredEquipment: formState.requiredEquipment
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        upsellRecommendations: formState.upsellRecommendations
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        inspectionChecklist: formState.inspectionChecklist
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        recommendedParts: formState.recommendedParts
          .filter((rec) => rec.partId)
          .map((rec) => ({
            part: rec.partId,
            quantity: Number(rec.quantity) || 1,
            unit: rec.unit || "each",
            note: rec.note,
          })),
      };

      if (formState.id) {
        await updateServicePackage({ variables: { id: formState.id, input: payload } });
        toast.success("Service updated");
        setSelectedPackageId(formState.id);
        await refetchDetail();
      } else {
        const result = await createServicePackage({ variables: { input: payload } });
        const newId = result.data?.createServicePackage?.id;
        if (newId) setSelectedPackageId(newId);
        toast.success("Service created");
      }
      await refetchPackages();
      setIsFormOpen(false);
      setFormState(createEmptyServiceForm());
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to save service package");
    }
  };

  const handleDeletePackage = async (id: string) => {
    try {
      await deleteServicePackage({ variables: { id } });
      toast.success("Service removed");
      setSelectedPackageId(undefined);
      await refetchPackages();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete service package");
    }
  };

  const displayedPackages = useMemo(() => packages, [packages]);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Service Catalog</h1>
            <p className="text-muted-foreground">Blueprint every repair experience with transparent labor guides, curated parts kits, and bay-ready checklists.</p>
          </div>
          {canManageCatalog && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => refetchPackages()}>
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Service Package
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search by service code, name, or description" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <Tabs value={activeCategory ?? "all"} onValueChange={(value) => setActiveCategory(value === "all" ? undefined : value)}>
                <TabsList className="flex-wrap justify-start md:justify-end">
                  <TabsTrigger value="all">All</TabsTrigger>
                  {SERVICE_CATEGORIES.map((category) => (
                    <TabsTrigger key={category} value={category}>
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayedPackages.map((service) => (
              <button
                key={service.id}
                className={`rounded-xl border p-4 text-left transition hover:border-primary hover:shadow ${selectedPackageId === service.id ? "border-primary shadow" : "border-border"}`}
                onClick={() => setSelectedPackageId(service.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {service.category}
                      </Badge>
                      {service.isFeatured && <Sparkles className="h-4 w-4 text-amber-500" />}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{service.name}</h3>
                    <p className="text-xs text-muted-foreground">Code: {service.serviceCode}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-foreground">${service.basePrice.toFixed(0)}</div>
                    <p className="text-xs text-muted-foreground">{service.laborHours.toFixed(1)} labor hours</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{service.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="bg-muted/60">
                    <Wrench className="mr-1 h-3 w-3" /> {service.bayType}
                  </Badge>
                  <Badge variant="outline" className="bg-muted/60">
                    <Brain className="mr-1 h-3 w-3" /> {service.skillLevel}
                  </Badge>
                  {service.sameDayEligible && (
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-700">
                      <Gauge className="mr-1 h-3 w-3" /> Same-day ready
                    </Badge>
                  )}
                </div>
              </button>
            ))}
            {displayedPackages.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No service packages match your filters.</p>}
          </CardContent>
        </Card>

        {selectedPackageId && activePackage && (
          <Card>
            <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-2xl font-semibold text-foreground">{activePackage.name}</CardTitle>
                <p className="text-sm text-muted-foreground">Service code {activePackage.serviceCode} - {activePackage.category}</p>
              </div>
              {canManageCatalog && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleEditPackage(activePackage.id)}>
                    Edit Package
                  </Button>
                  <Button variant="ghost" onClick={() => handleDeletePackage(activePackage.id)} disabled={deleting}>
                    Remove
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-[2fr,1fr]">
              <div className="space-y-5">
                <section className="rounded-lg border border-border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <ClipboardCheck className="h-4 w-4" /> Workflow
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {(activePackage.detailedSteps ?? []).map((step: string, index: number) => (
                      <li key={index} className="flex gap-3 text-sm">
                        <span className="mt-0.5 h-6 w-6 rounded-full bg-primary/10 text-center text-xs font-semibold leading-6 text-primary">{index + 1}</span>
                        <p className="text-foreground">{step}</p>
                      </li>
                    ))}
                    {(!activePackage.detailedSteps || activePackage.detailedSteps.length === 0) && <p className="text-sm text-muted-foreground">No workflow steps documented yet.</p>}
                  </ul>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Hammer className="h-4 w-4" /> Required Equipment
                  </h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(activePackage.requiredEquipment ?? []).map((equipment: string, index: number) => (
                      <div key={index} className="rounded-md bg-muted/50 p-3 text-sm text-foreground">
                        {equipment}
                      </div>
                    ))}
                    {(!activePackage.requiredEquipment || activePackage.requiredEquipment.length === 0) && <p className="text-sm text-muted-foreground">No special equipment required.</p>}
                  </div>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Shield className="h-4 w-4" /> Service Standards
                  </h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <span className="text-xs uppercase text-muted-foreground">Warranty</span>
                      <p className="text-foreground">{activePackage.warrantyMonths ? `${activePackage.warrantyMonths} months` : "Custom declared"}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <span className="text-xs uppercase text-muted-foreground">Bay Type</span>
                      <p className="text-foreground">{activePackage.bayType}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <span className="text-xs uppercase text-muted-foreground">Skill Requirement</span>
                      <p className="text-foreground">{activePackage.skillLevel}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <span className="text-xs uppercase text-muted-foreground">Same Day Eligible</span>
                      <p className="text-foreground">{activePackage.sameDayEligible ? "Yes" : "No"}</p>
                    </div>
                  </div>
                  {activePackage.safetyNotes && <p className="mt-3 text-sm text-muted-foreground">{activePackage.safetyNotes}</p>}
                </section>
              </div>
              <div className="space-y-5">
                <section className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recommended Parts</h3>
                  <Table className="mt-3 text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part</TableHead>
                        <TableHead className="w-20">Qty</TableHead>
                        <TableHead className="w-20">Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activePackage.recommendedParts ?? []).map((rec: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="font-medium text-foreground">{rec.part?.name ?? "Part"}</div>
                            <div className="text-xs text-muted-foreground">{rec.note}</div>
                          </TableCell>
                          <TableCell>{rec.quantity}</TableCell>
                          <TableCell>{rec.unit}</TableCell>
                        </TableRow>
                      ))}
                      {(!activePackage.recommendedParts || activePackage.recommendedParts.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground">
                            No recommended kits defined.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upsell Playbook</h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {(activePackage.upsellRecommendations ?? []).map((item: string, index: number) => (
                      <li key={index} className="flex gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 text-amber-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                    {(!activePackage.upsellRecommendations || activePackage.upsellRecommendations.length === 0) && <li>No upsell guidance captured yet.</li>}
                  </ul>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inspection Checklist</h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {(activePackage.inspectionChecklist ?? []).map((item: string, index: number) => (
                      <li key={index} className="flex gap-2">
                        <Shield className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                    {(!activePackage.inspectionChecklist || activePackage.inspectionChecklist.length === 0) && <li>No inspection notes documented.</li>}
                  </ul>
                </section>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? "Edit Service Package" : "New Service Package"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Service Code</Label>
              <Input value={formState.serviceCode} onChange={(event) => setFormState((prev) => ({ ...prev, serviceCode: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Service Name</Label>
              <Input value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Short Label</Label>
              <Input value={formState.shortName ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, shortName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formState.category} onValueChange={(value) => setFormState((prev) => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bay Type</Label>
              <Select value={formState.bayType} onValueChange={(value) => setFormState((prev) => ({ ...prev, bayType: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bay" />
                </SelectTrigger>
                <SelectContent>
                  {BAY_TYPES.map((bay) => (
                    <SelectItem key={bay} value={bay}>
                      {bay}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Skill Level</Label>
              <Select value={formState.skillLevel} onValueChange={(value) => setFormState((prev) => ({ ...prev, skillLevel: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Skill" />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Labor Hours</Label>
              <Input type="number" step="0.1" value={formState.laborHours} onChange={(event) => setFormState((prev) => ({ ...prev, laborHours: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Base Price</Label>
              <Input type="number" value={formState.basePrice} onChange={(event) => setFormState((prev) => ({ ...prev, basePrice: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Warranty (months)</Label>
              <Input type="number" value={formState.warrantyMonths ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, warrantyMonths: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>Service Interval (miles)</Label>
              <Input type="number" value={formState.serviceIntervalMiles ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, serviceIntervalMiles: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>Service Interval (months)</Label>
              <Input type="number" value={formState.serviceIntervalMonths ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, serviceIntervalMonths: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="md:col-span-2 grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox checked={formState.sameDayEligible} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, sameDayEligible: !!checked }))} />
                <Label>Same-day eligible</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox checked={formState.isSeasonal} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isSeasonal: !!checked }))} />
                <Label>Seasonal program</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox checked={formState.isFeatured} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isFeatured: !!checked }))} />
                <Label>Feature on dashboard</Label>
              </div>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={formState.description ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Workflow Steps</Label>
              <Textarea rows={4} placeholder="One step per line" value={formState.detailedSteps} onChange={(event) => setFormState((prev) => ({ ...prev, detailedSteps: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Required Equipment</Label>
              <Textarea rows={3} placeholder="One per line" value={formState.requiredEquipment} onChange={(event) => setFormState((prev) => ({ ...prev, requiredEquipment: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Upsell Recommendations</Label>
              <Textarea rows={3} placeholder="One per line" value={formState.upsellRecommendations} onChange={(event) => setFormState((prev) => ({ ...prev, upsellRecommendations: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Inspection Checklist</Label>
              <Textarea rows={3} placeholder="One per line" value={formState.inspectionChecklist} onChange={(event) => setFormState((prev) => ({ ...prev, inspectionChecklist: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Safety Notes</Label>
              <Textarea rows={2} value={formState.safetyNotes ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, safetyNotes: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Recommended Parts Kits</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setFormState((prev) => ({
                  ...prev,
                  recommendedParts: [...prev.recommendedParts, { partId: "", quantity: 1, unit: "each", note: "" }],
                }))}>
                  <Plus className="mr-2 h-4 w-4" /> Add Part
                </Button>
              </div>
              <div className="space-y-3">
                {formState.recommendedParts.map((rec, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[2fr,1fr,1fr,auto]">
                    <Select value={rec.partId} onValueChange={(value) => setFormState((prev) => ({
                      ...prev,
                      recommendedParts: prev.recommendedParts.map((r, i) => i === index ? { ...r, partId: value } : r),
                    }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select part" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.partNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={rec.quantity} onChange={(event) => setFormState((prev) => ({
                      ...prev,
                      recommendedParts: prev.recommendedParts.map((r, i) => i === index ? { ...r, quantity: Number(event.target.value) } : r),
                    }))} />
                    <Input value={rec.unit} onChange={(event) => setFormState((prev) => ({
                      ...prev,
                      recommendedParts: prev.recommendedParts.map((r, i) => i === index ? { ...r, unit: event.target.value } : r),
                    }))} />
                    <Button variant="ghost" size="sm" onClick={() => setFormState((prev) => ({
                      ...prev,
                      recommendedParts: prev.recommendedParts.filter((_, i) => i !== index),
                    }))}>
                      Remove
                    </Button>
                    <div className="md:col-span-4">
                      <Textarea rows={2} placeholder="Technician notes" value={rec.note ?? ""} onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        recommendedParts: prev.recommendedParts.map((r, i) => i === index ? { ...r, note: event.target.value } : r),
                      }))} />
                    </div>
                  </div>
                ))}
                {formState.recommendedParts.length === 0 && <p className="text-sm text-muted-foreground">No parts assigned. Add canonical parts kits to accelerate pick-times.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitForm} disabled={creating || updating}>
              {formState.id ? "Save Changes" : "Create Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
