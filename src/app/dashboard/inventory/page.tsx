"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useInventoryItems,
  useInventorySummary,
  useInventoryAlerts,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useRecordInventoryTransaction,
  useRecordInventoryWaste,
  useSuppliers,
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  useWasteReport,
  useSupplierPerformance,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { QRCodeSVG } from "qrcode.react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  ClipboardList,
  Gauge,
  Package2,
  Plus,
  QrCode,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Download,
} from "lucide-react";
import { format } from "date-fns";

interface InventoryFormState {
  id?: string;
  name: string;
  category: string;
  subcategory?: string;
  segment?: string;
  partNumber: string;
  oemPartNumber?: string;
  aftermarketPartNumber?: string;
  brand?: string;
  manufacturer?: string;
  description?: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  reorderPoint: number;
  reorderQuantity: number;
  safetyStock: number;
  maxCapacity: number;
  costPerUnit: number;
  msrp?: number;
  warrantyMonths?: number;
  coreCharge?: number;
  supplierId?: string;
  supplierName?: string;
  leadTimeDays?: number;
  averageMonthlyUsage?: number;
  notes?: string;
}

interface PurchaseOrderFormState {
  supplierId: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items: Array<{
    inventoryItemId: string;
    quantity: number;
    unitCost: number;
    unit?: string;
  }>;
}

const CATEGORIES = [
  "Braking",
  "Powertrain",
  "Electrical",
  "Suspension",
  "Fluids",
  "Diagnostics",
  "HVAC",
  "Tires",
  "Body",
  "Interior",
  "Shop Supplies",
  "Tools",
  "Accessories",
  "Detailing",
  "Fleet",
];

const SEGMENTS = ["OEM", "OE Equivalent", "Aftermarket", "Performance"];

const STATUS_BADGES: Record<string, string> = {
  in_stock: "bg-emerald-100 text-emerald-700",
  low: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
  out: "bg-rose-200 text-rose-900",
  special_order: "bg-slate-200 text-slate-900",
};

const TRANSACTION_TYPES = [
  { value: "purchase", label: "Purchase Receipt" },
  { value: "issue_to_repair", label: "Issue to Repair" },
  { value: "return_to_stock", label: "Return to Stock" },
  { value: "warranty", label: "Warranty Claim" },
  { value: "adjustment", label: "Manual Adjustment" },
  { value: "transfer_in", label: "Transfer In" },
  { value: "transfer_out", label: "Transfer Out" },
  { value: "scrap", label: "Scrap" },
  { value: "core_return", label: "Core Return" },
  { value: "count_adjustment", label: "Count Adjustment" },
];

const WASTE_REASONS = [
  "Damaged upon arrival",
  "Expired or out of specification",
  "Installation damage",
  "Warranty failure",
  "Lost or missing",
];

function createEmptyInventoryForm(): InventoryFormState {
  return {
    name: "",
    category: CATEGORIES[0] ?? "Braking",
    segment: SEGMENTS[1] ?? "OE Equivalent",
    partNumber: "",
    unit: "each",
    currentStock: 0,
    minThreshold: 2,
    reorderPoint: 3,
    reorderQuantity: 1,
    safetyStock: 0,
    maxCapacity: 10,
    costPerUnit: 0,
  };
}

function createEmptyPurchaseOrderForm(): PurchaseOrderFormState {
  return {
    supplierId: "",
    items: [],
  };
}

export default function InventoryPage() {
  const permissions = usePermissions();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState("parts");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<InventoryFormState>(createEmptyInventoryForm);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionType, setTransactionType] = useState("purchase");
  const [transactionQuantity, setTransactionQuantity] = useState(1);
  const [transactionUnitCost, setTransactionUnitCost] = useState(0);
  const [transactionNotes, setTransactionNotes] = useState("");
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrItem, setQrItem] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [wasteItem, setWasteItem] = useState<any>(null);
  const [wasteQuantity, setWasteQuantity] = useState(1);
  const [wasteReason, setWasteReason] = useState<string>(WASTE_REASONS[0]);
  const [wasteNotes, setWasteNotes] = useState("");
  const [poForm, setPoForm] = useState<PurchaseOrderFormState>(createEmptyPurchaseOrderForm);

  const { data: summaryData, refetch: refetchSummary } = useInventorySummary();
  const { data: alertData } = useInventoryAlerts();
  const { data: supplierData } = useSuppliers();
  const { data: poData } = usePurchaseOrders();
  const { data: wasteReportData } = useWasteReport();
  const { data: supplierPerformanceData } = useSupplierPerformance();
  const { data: inventoryData, refetch: refetchInventory, loading: inventoryLoading } = useInventoryItems({
    search,
    filterCategory: categoryFilter,
    pagination: { page, pageSize: 25 },
  });

  const [createInventoryItem, { loading: creating }] = useCreateInventoryItem();
  const [updateInventoryItem, { loading: updating }] = useUpdateInventoryItem();
  const [deleteInventoryItem, { loading: deleting }] = useDeleteInventoryItem();
  const [recordTransaction, { loading: recordingTransaction }] = useRecordInventoryTransaction();
  const [recordWaste, { loading: recordingWaste }] = useRecordInventoryWaste();
  const [createPurchaseOrder, { loading: creatingPo }] = useCreatePurchaseOrder();
  const [updatePurchaseOrderStatus] = useUpdatePurchaseOrderStatus();

  const items = inventoryData?.inventoryItems.items ?? [];
  const totalItems = inventoryData?.inventoryItems.totalCount ?? 0;
  const wasteEntries = wasteReportData?.wasteReport ?? [];
  const supplierPerformance = supplierPerformanceData?.supplierPerformance ?? [];
  const alerts = alertData?.inventoryAlerts ?? [];
  const suppliers = supplierData?.suppliers ?? [];
  const purchaseOrders = poData?.purchaseOrders ?? [];

  const activeItem = useMemo(() => items.find((item) => item.id === activeItemId) ?? null, [items, activeItemId]);
  const canManageInventory = (permissions as any).inventory;

  const handleOpenCreate = () => {
    setFormState(createEmptyInventoryForm());
    setActiveItemId(null);
    setIsFormOpen(true);
  };

  const handleEditItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setActiveItemId(item.id);
    setFormState({
      id: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      segment: item.segment,
      partNumber: item.partNumber,
      oemPartNumber: item.oemPartNumber,
      aftermarketPartNumber: item.aftermarketPartNumber,
      brand: item.brand,
      manufacturer: item.manufacturer,
      description: item.description,
      unit: item.unit,
      currentStock: item.currentStock,
      minThreshold: item.minThreshold,
      reorderPoint: item.reorderPoint,
      reorderQuantity: item.reorderQuantity,
      safetyStock: item.safetyStock,
      maxCapacity: item.maxCapacity,
      costPerUnit: item.costPerUnit,
      msrp: item.msrp,
      warrantyMonths: item.warrantyMonths,
      coreCharge: item.coreCharge,
      supplierId: undefined,
      supplierName: item.supplierName,
      leadTimeDays: item.leadTimeDays,
      averageMonthlyUsage: item.averageMonthlyUsage,
      notes: item.notes,
    });
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
  };

  const handleSubmitForm = async () => {
    if (!formState.name || !formState.partNumber) {
      toast.error("Name and part number are required");
      return;
    }
    try {
      const payload = {
        name: formState.name,
        category: formState.category,
        subcategory: formState.subcategory,
        segment: formState.segment,
        partNumber: formState.partNumber,
        oemPartNumber: formState.oemPartNumber,
        aftermarketPartNumber: formState.aftermarketPartNumber,
        brand: formState.brand,
        manufacturer: formState.manufacturer,
        description: formState.description,
        unit: formState.unit,
        currentStock: Number(formState.currentStock),
        minThreshold: Number(formState.minThreshold),
        reorderPoint: Number(formState.reorderPoint),
        reorderQuantity: Number(formState.reorderQuantity),
        safetyStock: Number(formState.safetyStock),
        maxCapacity: Number(formState.maxCapacity),
        costPerUnit: Number(formState.costPerUnit),
        msrp: formState.msrp ? Number(formState.msrp) : null,
        warrantyMonths: formState.warrantyMonths ? Number(formState.warrantyMonths) : null,
        coreCharge: formState.coreCharge ? Number(formState.coreCharge) : null,
        supplier: formState.supplierId,
        supplierName: formState.supplierName,
        leadTimeDays: formState.leadTimeDays ? Number(formState.leadTimeDays) : null,
        averageMonthlyUsage: formState.averageMonthlyUsage ? Number(formState.averageMonthlyUsage) : null,
        notes: formState.notes,
      };

      if (formState.id) {
        await updateInventoryItem({ variables: { id: formState.id, input: payload } });
        toast.success("Part updated");
      } else {
        await createInventoryItem({ variables: { input: payload } });
        toast.success("Part created");
      }
      setIsFormOpen(false);
      setFormState(createEmptyInventoryForm());
      await Promise.all([refetchInventory(), refetchSummary()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save part");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteInventoryItem({ variables: { id: itemId } });
      toast.success("Part removed");
      await Promise.all([refetchInventory(), refetchSummary()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete part");
    }
  };

  const handleOpenTransaction = (itemId: string) => {
    setActiveItemId(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item) setTransactionUnitCost(item.costPerUnit ?? 0);
    setTransactionQuantity(1);
    setTransactionType("purchase");
    setTransactionNotes("");
    setIsTransactionOpen(true);
  };

  const handleSubmitTransaction = async () => {
    if (!activeItemId) return;
    if (transactionQuantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    try {
      await recordTransaction({
        variables: {
          itemId: activeItemId,
          quantity: Number(transactionQuantity),
          unitCost: Number(transactionUnitCost),
          transactionType,
          reason: transactionNotes || null,
        },
      });
      toast.success("Inventory updated");
      setIsTransactionOpen(false);
      await Promise.all([refetchInventory(), refetchSummary()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record transaction");
    }
  };

  const handleOpenQrModal = (item: any) => {
    setQrItem(item);
    setQrModalOpen(true);
    setQrDataUrl(null);
  };

  useEffect(() => {
    if (!qrModalOpen || !qrItem) return;
    const payload = {
      id: qrItem.id,
      name: qrItem.name,
      partNumber: qrItem.partNumber,
      supplier: qrItem.supplierName,
    };
    QRCode.toDataURL(JSON.stringify(payload))
      .then(setQrDataUrl)
      .catch(() => toast.error("Unable to generate QR code"));
  }, [qrModalOpen, qrItem]);

  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrItem) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${qrItem.partNumber ?? qrItem.id}-qr.png`;
    link.click();
  };

  const handleCopyQr = async () => {
    if (!qrDataUrl) return;
    try {
      await navigator.clipboard.writeText(qrDataUrl);
      toast.success("QR code copied to clipboard");
    } catch {
      toast.error("Failed to copy QR code");
    }
  };

  const handleOpenWasteModal = (item: any) => {
    setWasteItem(item);
    setWasteQuantity(1);
    setWasteReason(WASTE_REASONS[0]);
    setWasteNotes("");
    setWasteModalOpen(true);
  };

  const handleSubmitWaste = async () => {
    if (!wasteItem) return;
    if (wasteQuantity <= 0) {
      toast.error("Waste quantity must be greater than zero");
      return;
    }
    try {
      await recordWaste({
        variables: {
          itemId: wasteItem.id,
          quantity: Number(wasteQuantity),
          unitCost: Number(wasteItem.costPerUnit ?? 0),
          reason: wasteReason,
          label: wasteReason,
          notes: wasteNotes || null,
        },
      });
      toast.success("Waste logged");
      setWasteModalOpen(false);
      await Promise.all([refetchInventory(), refetchSummary()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record waste");
    }
  };

  const handleOpenPurchaseOrder = () => {
    setPoForm(createEmptyPurchaseOrderForm());
    setPoFormOpen(true);
  };

  const handleAddPoLine = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { inventoryItemId: "", quantity: 1, unitCost: 0 }],
    }));
  };

  const handleSubmitPurchaseOrder = async () => {
    if (!poForm.supplierId || poForm.items.length === 0) {
      toast.error("Supplier and at least one line are required");
      return;
    }
    if (poForm.items.some((line) => !line.inventoryItemId)) {
      toast.error("Every line needs a part selected");
      return;
    }
    try {
      await createPurchaseOrder({
        variables: {
          supplierId: poForm.supplierId,
          expectedDeliveryDate: poForm.expectedDeliveryDate || null,
          notes: poForm.notes || null,
          items: poForm.items.map((line) => ({
            inventoryItem: line.inventoryItemId,
            quantityOrdered: Number(line.quantity),
            unitCost: Number(line.unitCost),
            unit: items.find((i) => i.id === line.inventoryItemId)?.unit ?? "each",
          })),
        },
      });
      toast.success("Purchase order submitted");
      setPoFormOpen(false);
      await refetchInventory();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to create purchase order");
    }
  };

  const handleMarkPoReceived = async (poId: string) => {
    try {
      await updatePurchaseOrderStatus({ variables: { id: poId, status: "received", receivedDate: new Date().toISOString() } });
      toast.success("Purchase order received");
      await Promise.all([refetchInventory(), refetchSummary()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update purchase order");
    }
  };
  const summary = summaryData?.inventorySummary;
  const totalPages = Math.max(1, Math.ceil(totalItems / 25));

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Parts Inventory</h1>
            <p className="text-muted-foreground">Control the heartbeat of the parts department - precise visibility, rapid replenishment, and bulletproof traceability.</p>
          </div>
          {canManageInventory && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => refetchInventory()} disabled={inventoryLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button onClick={handleOpenPurchaseOrder}>
                <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase Order
              </Button>
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" /> Add Part
              </Button>
            </div>
          )}
        </div>

        {summary && (
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${summary.totalInventoryValue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across {summary.totalParts} unique SKUs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Parts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.criticalParts}</div>
                <p className="text-xs text-muted-foreground">Require immediate action</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
                <ClipboardList className="h-4 w-4 text-sky-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.lowStockParts}</div>
                <p className="text-xs text-muted-foreground">Schedule replenishment soon</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Special Order</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.specialOrderParts}</div>
                <p className="text-xs text-muted-foreground">Monitoring customer-specific requests</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Waste & Scrap</CardTitle>
                <Trash2 className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalWasteQuantity.toFixed(1)} units</div>
                <p className="text-xs text-muted-foreground">${summary.totalWasteCost.toFixed(2)} cost impact</p>
              </CardContent>
            </Card>
          </div>
        )}

        {alerts.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" /> Priority Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex flex-col gap-1 rounded-md border border-amber-200/60 bg-white/80 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/40 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{alert.inventoryItem.name}</div>
                    <p className="text-muted-foreground">{alert.message}</p>
                  </div>
                  <Badge variant="outline" className="whitespace-nowrap border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-200">
                    {alert.severity.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            <TabsTrigger value="parts" className="flex items-center gap-2">
              <Package2 className="h-4 w-4" /> Parts Catalog
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="parts" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by part number, name, or supplier"
                        className="pl-9"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <Select value={categoryFilter ?? "all"} onValueChange={(value) => {
                      setCategoryFilter(value === "all" ? undefined : value);
                      setPage(1);
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part</TableHead>
                        <TableHead className="hidden md:table-cell">Category</TableHead>
                        <TableHead className="hidden lg:table-cell">Segment</TableHead>
                        <TableHead className="hidden xl:table-cell">Preferred Supplier</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="hidden lg:table-cell">Par / Reorder</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead className="hidden xl:table-cell">Waste</TableHead>
                        <TableHead>Status</TableHead>
                        {canManageInventory && <TableHead className="w-[160px]">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="font-semibold text-foreground">{item.name}</div>
                            <div className="text-xs text-muted-foreground">#{item.partNumber}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{item.category}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{item.segment ?? "—"}</TableCell>
                          <TableCell className="hidden xl:table-cell text-muted-foreground">{item.preferredSupplier ?? item.supplierName ?? "—"}</TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">{item.currentStock.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Min {item.minThreshold} • Lead {item.leadTimeDays ?? "—"}d</p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">
                            {(item.parLevel ?? "—")} / {item.reorderPoint}
                          </TableCell>
                          <TableCell>${item.costPerUnit.toFixed(2)}</TableCell>
                          <TableCell className="hidden xl:table-cell text-muted-foreground">
                            {item.waste ? `${item.waste.toFixed(1)} ${item.unit}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_BADGES[item.status] ?? "bg-muted text-muted-foreground"}>
                              {item.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          {canManageInventory && (
                            <TableCell className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditItem(item.id)}>
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleOpenTransaction(item.id)}>
                                Adjust
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleOpenQrModal(item)}>
                                <QrCode className="mr-1 h-3.5 w-3.5" /> QR
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleOpenWasteModal(item)}>
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Waste
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)}>
                                Remove
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div>
                    Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, totalItems)} of {totalItems}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span>Page {page} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Open Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {purchaseOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchase orders yet. Create one to replenish critical parts.</p>
                ) : (
                  <div className="space-y-3">
                    {purchaseOrders.map((po) => (
                      <div key={po.id} className="rounded-lg border border-border p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">{po.poNumber}</h3>
                            <p className="text-sm text-muted-foreground">{po.supplier?.name ?? "Unknown Supplier"}</p>
                            <div className="mt-2 text-xs text-muted-foreground">Ordered {format(new Date(po.orderDate), "MMM d, yyyy")}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{po.status.replace(/_/g, " ")}</Badge>
                            {canManageInventory && po.status !== "received" && (
                              <Button size="sm" onClick={() => handleMarkPoReceived(po.id)}>
                                Mark Received
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {po.items.map((line, index) => (
                            <div key={index} className="rounded-md bg-muted/50 p-3 text-sm">
                              <div className="font-medium text-foreground">{line.name}</div>
                              <div className="text-xs text-muted-foreground">{line.partNumber}</div>
                              <div className="mt-1 flex items-center justify-between">
                                <span>Qty: {line.quantityOrdered}</span>
                                <span>${line.unitCost.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Categories</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {summary?.topCategories?.map((category) => (
                  <div key={category.category} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{category.category}</p>
                        <div className="text-2xl font-semibold text-foreground">${category.value.toLocaleString()}</div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Inventory on hand: {category.quantity.toFixed(1)} units</p>
                  </div>
                )) ?? <p className="text-sm text-muted-foreground">No category insights yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent Waste & Scrap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {wasteEntries.length ? wasteEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between text-foreground">
                      <span className="font-medium">{entry.item.name}</span>
                      <Badge variant="outline" className="border-rose-200 text-rose-600">{entry.label ?? 'Waste'}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{entry.quantity.toFixed(1)} {entry.item.unit} ? ${entry.totalCost.toFixed(2)}</span>
                      <span>{format(new Date(entry.recordedAt), 'MMM d')}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
                    {entry.recordedByName && (
                      <p className="text-xs text-muted-foreground">Logged by {entry.recordedByName}</p>
                    )}
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No waste events logged this period.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Supplier Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {supplierPerformance.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Lead Time (d)</TableHead>
                        <TableHead className="text-right">Fill Rate</TableHead>
                        <TableHead className="text-right">Waste Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierPerformance.slice(0, 5).map((entry) => (
                        <TableRow key={entry.supplier.id}>
                          <TableCell className="font-medium">{entry.supplier.name}</TableCell>
                          <TableCell className="text-right">${entry.totalSpend.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{entry.averageLeadTimeDays.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{(entry.fillRate * 100).toFixed(1)}%</TableCell>
                          <TableCell className="text-right">${entry.wasteCost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Supplier scorecards will populate after initial cycles.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Operational Playbook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="font-semibold text-foreground">Daily Cycle Checks</div>
                    <p>Spot-count braking, electrical, and express service bins before 9am to catch overnight shrinkage.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="font-semibold text-foreground">Bay Staging Discipline</div>
                    <p>Push pre-picked kits to bays 30 minutes prior to appointment start - saves 12 minutes per repair order.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="font-semibold text-foreground">Vendor Scorecards</div>
                    <p>Leverage on-time delivery data to renegotiate freight with low performers each quarter.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit Part */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? "Edit Part" : "Add Part"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Part Name</Label>
              <Input id="name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partNumber">Part Number</Label>
              <Input id="partNumber" value={formState.partNumber} onChange={(event) => setFormState((prev) => ({ ...prev, partNumber: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formState.category} onValueChange={(value) => setFormState((prev) => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={formState.supplierId ?? ""} onValueChange={(value) => setFormState((prev) => ({ ...prev, supplierId: value || undefined, supplierName: suppliers.find((s) => s.id === value)?.name }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Segment</Label>
              <Select value={formState.segment} onValueChange={(value) => setFormState((prev) => ({ ...prev, segment: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select segment" />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((segment) => (
                    <SelectItem key={segment} value={segment}>
                      {segment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input value={formState.unit} onChange={(event) => setFormState((prev) => ({ ...prev, unit: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Current Stock</Label>
              <Input type="number" value={formState.currentStock} onChange={(event) => setFormState((prev) => ({ ...prev, currentStock: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Reorder Point</Label>
              <Input type="number" value={formState.reorderPoint} onChange={(event) => setFormState((prev) => ({ ...prev, reorderPoint: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Reorder Quantity</Label>
              <Input type="number" value={formState.reorderQuantity} onChange={(event) => setFormState((prev) => ({ ...prev, reorderQuantity: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost</Label>
              <Input type="number" value={formState.costPerUnit} onChange={(event) => setFormState((prev) => ({ ...prev, costPerUnit: Number(event.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>MSRP</Label>
              <Input type="number" value={formState.msrp ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, msrp: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>Warranty (months)</Label>
              <Input type="number" value={formState.warrantyMonths ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, warrantyMonths: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>Lead Time (days)</Label>
              <Input type="number" value={formState.leadTimeDays ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, leadTimeDays: event.target.value ? Number(event.target.value) : undefined }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea value={formState.description ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea value={formState.notes ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleFormClose}>Cancel</Button>
            <Button onClick={handleSubmitForm} disabled={creating || updating}>
              {formState.id ? "Save Changes" : "Create Part"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Transaction */}
      <Dialog open={isTransactionOpen} onOpenChange={setIsTransactionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select transaction" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" value={transactionQuantity} onChange={(event) => setTransactionQuantity(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost</Label>
                <Input type="number" value={transactionUnitCost} onChange={(event) => setTransactionUnitCost(Number(event.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={transactionNotes} onChange={(event) => setTransactionNotes(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransactionOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitTransaction} disabled={recordingTransaction}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR & Label Studio */}
      <Dialog open={qrModalOpen} onOpenChange={(open) => {
        setQrModalOpen(open);
        if (!open) {
          setQrItem(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Part QR & Label</DialogTitle>
            <DialogDescription>Generate scan-friendly labels for bins, vans, and tool carts.</DialogDescription>
          </DialogHeader>
          {qrItem ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="rounded-md bg-white p-4 shadow-sm">
                  <QRCodeSVG value={JSON.stringify({ id: qrItem.id, pn: qrItem.partNumber })} size={128} />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-foreground">{qrItem.name}</p>
                  <p className="text-muted-foreground">#{qrItem.partNumber}</p>
                  <p className="text-muted-foreground">{qrItem.supplierName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleDownloadQr} disabled={!qrDataUrl}>
                  <Download className="mr-2 h-4 w-4" /> Download PNG
                </Button>
                <Button variant="outline" onClick={handleCopyQr} disabled={!qrDataUrl}>
                  Copy as Data URL
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Scan with the LedgerOne mobile tools app to jump directly to this part.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a part to generate a QR code.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Waste / Scrap */}
      <Dialog open={wasteModalOpen} onOpenChange={(open) => {
        setWasteModalOpen(open);
        if (!open) {
          setWasteItem(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Waste or Scrap</DialogTitle>
            <DialogDescription>Capture compliance notes whenever parts are scrapped.</DialogDescription>
          </DialogHeader>
          {wasteItem ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-semibold text-foreground">{wasteItem.name}</p>
                <p className="text-muted-foreground">#{wasteItem.partNumber}</p>
                <p className="text-muted-foreground">On hand: {wasteItem.currentStock} {wasteItem.unit}</p>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={wasteQuantity} onChange={(event) => setWasteQuantity(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={wasteReason} onValueChange={setWasteReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {WASTE_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={wasteNotes} onChange={(event) => setWasteNotes(event.target.value)} placeholder="Technician notes or RO reference" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a part to record waste.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWasteModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitWaste} disabled={recordingWaste}>Record Waste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Order */}
      <Dialog open={poFormOpen} onOpenChange={setPoFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={poForm.supplierId || ""} onValueChange={(value) => setPoForm((prev) => ({ ...prev, supplierId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expected Delivery</Label>
                <Input type="date" value={poForm.expectedDeliveryDate ?? ""} onChange={(event) => setPoForm((prev) => ({ ...prev, expectedDeliveryDate: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={poForm.notes ?? ""} onChange={(event) => setPoForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={handleAddPoLine}>
                  <Plus className="mr-2 h-4 w-4" /> Add Line
                </Button>
              </div>
              <div className="space-y-3">
                {poForm.items.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-4">
                    <Select value={line.inventoryItemId} onValueChange={(value) => setPoForm((prev) => ({
                      ...prev,
                      items: prev.items.map((l, i) => i === index ? { ...l, inventoryItemId: value } : l),
                    }))}>
                      <SelectTrigger className="md:col-span-2">
                        <SelectValue placeholder="Select part" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.partNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={line.quantity}
                      onChange={(event) => setPoForm((prev) => ({
                        ...prev,
                        items: prev.items.map((l, i) => i === index ? { ...l, quantity: Number(event.target.value) } : l),
                      }))}
                      placeholder="Qty"
                    />
                    <Input
                      type="number"
                      value={line.unitCost}
                      onChange={(event) => setPoForm((prev) => ({
                        ...prev,
                        items: prev.items.map((l, i) => i === index ? { ...l, unitCost: Number(event.target.value) } : l),
                      }))}
                      placeholder="Unit Cost"
                    />
                  </div>
                ))}
                {poForm.items.length === 0 && <p className="text-sm text-muted-foreground">Add at least one part to build the order.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitPurchaseOrder} disabled={creatingPo}>Submit Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
