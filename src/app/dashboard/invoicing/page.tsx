"use client";

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { usePermissions } from "@/lib/hooks/use-permissions";
import {
  useInvoices,
  useInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useAddInvoicePayment,
  useUpdateInvoiceStatus,
  useTeamMembers,
  useServicePackages,
  useServiceLaneTickets,
  useInventoryItems,
} from "@/lib/hooks/use-graphql";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CreditCard,
  DollarSign,
  FileText,
  Filter,
  Mail,
  Plus,
  Search,
  Send,
  Wrench,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-200 text-slate-900",
  pending: "bg-amber-100 text-amber-700",
  awaiting_approval: "bg-amber-200 text-amber-900",
  partial: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-rose-100 text-rose-700",
};

const PAYMENT_METHODS = ["cash", "card", "ach", "check", "financing", "warranty"];

interface InvoiceFormState {
  id?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  advisorId?: string;
  serviceLaneTicketId?: string;
  dueDate: string;
  description?: string;
  paymentTerms: string;
  laborLines: Array<{ servicePackageId?: string; description: string; technicianId?: string; hours: number; rate: number }>;
  partsLines: Array<{ inventoryItemId?: string; description: string; quantity: number; unitPrice: number; taxable: boolean }>;
  shopSupplies?: number;
  hazmatFee?: number;
  discounts?: number;
  tax?: number;
  notes?: string;
  warrantyNotes?: string;
  followUpReminders: Array<{ description: string; dueDate?: string }>;
  status: string;
}

function createEmptyInvoiceForm(): InvoiceFormState {
  const today = new Date();
  const due = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    clientName: "",
    dueDate: due.toISOString().slice(0, 10),
    paymentTerms: "Due on Receipt",
    laborLines: [],
    partsLines: [],
    shopSupplies: 0,
    hazmatFee: 0,
    discounts: 0,
    tax: 0,
    followUpReminders: [],
    status: "pending",
  };
}
export default function ServiceBillingPage() {
  const permissions = usePermissions();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | undefined>();
  const [formState, setFormState] = useState<InvoiceFormState>(createEmptyInvoiceForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [paymentReference, setPaymentReference] = useState("");

  const { data: invoicesData, refetch: refetchInvoices } = useInvoices({
    status: statusFilter,
    search,
    pagination: { page, pageSize: 12 },
  });
  const { data: invoiceDetail, refetch: refetchInvoiceDetail } = useInvoice(selectedInvoiceId);
  const { data: teamData } = useTeamMembers();
  const { data: servicePackagesData } = useServicePackages({});
  const { data: openTicketsData } = useServiceLaneTickets({ status: "in_service" });
  const { data: inventoryData } = useInventoryItems({ pagination: { page: 1, pageSize: 120 } });

  const [createInvoice, { loading: creating }] = useCreateInvoice();
  const [updateInvoice, { loading: updating }] = useUpdateInvoice();
  const [addPayment, { loading: recordingPayment }] = useAddInvoicePayment();
  const [updateStatus, { loading: updatingStatus }] = useUpdateInvoiceStatus();

  const invoices = invoicesData?.invoices.items ?? [];
  const totalInvoices = invoicesData?.invoices.totalCount ?? 0;
  const activeInvoice = invoiceDetail?.invoice ?? null;
  const teamMembers = teamData?.teamMembers ?? [];
  const servicePackages = servicePackagesData?.servicePackages ?? [];
  const openTickets = openTicketsData?.serviceLaneTickets ?? [];
  const inventoryItems = inventoryData?.inventoryItems.items ?? [];
  const canManageInvoices = (permissions as any).invoicing;

  const totalPages = Math.max(1, Math.ceil(totalInvoices / 12));

  const handleOpenCreate = () => {
    setFormState(createEmptyInvoiceForm());
    setSelectedInvoiceId(undefined);
    setIsFormOpen(true);
  };

  const handleEditInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId) || activeInvoice;
    if (!invoice) return;
    setSelectedInvoiceId(invoice.id);
    setFormState({
      id: invoice.id,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail ?? "",
      clientPhone: invoice.clientPhone ?? "",
      advisorId: invoice.advisor?.id,
      serviceLaneTicketId: invoice.serviceLaneTicket?.id,
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      description: invoice.description ?? "",
      paymentTerms: invoice.paymentTerms ?? "Due on Receipt",
      laborLines: (invoice.laborLines ?? []).map((line: any) => ({
        servicePackageId: line.servicePackage?.id,
        description: line.description,
        technicianId: line.technician?.id,
        hours: line.hours,
        rate: line.rate,
      })),
      partsLines: (invoice.partsLines ?? []).map((line: any) => ({
        inventoryItemId: line.inventoryItem?.id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxable: line.taxable,
      })),
      shopSupplies: invoice.shopSupplies ?? 0,
      hazmatFee: invoice.hazmatFee ?? 0,
      discounts: invoice.discounts ?? 0,
      tax: invoice.tax ?? 0,
      notes: invoice.notes ?? "",
      warrantyNotes: invoice.warrantyNotes ?? "",
      followUpReminders: (invoice.followUpReminders ?? []).map((reminder: any) => ({
        description: reminder.description ?? "",
        dueDate: reminder.dueDate ? reminder.dueDate.slice(0, 10) : undefined,
      })),
      status: invoice.status,
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = async () => {
    if (!formState.clientName) {
      toast.error("Customer name is required");
      return;
    }
    try {
      const payload = {
        serviceLaneTicket: formState.serviceLaneTicketId,
        clientName: formState.clientName,
        clientEmail: formState.clientEmail || null,
        clientPhone: formState.clientPhone || null,
        advisor: formState.advisorId,
        dueDate: formState.dueDate,
        description: formState.description,
        paymentTerms: formState.paymentTerms,
        laborLines: formState.laborLines.map((line) => ({
          servicePackage: line.servicePackageId,
          description: line.description,
          technician: line.technicianId,
          hours: Number(line.hours),
          rate: Number(line.rate),
        })),
        partsLines: formState.partsLines.map((line) => ({
          inventoryItem: line.inventoryItemId,
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          taxable: line.taxable,
        })),
        shopSupplies: Number(formState.shopSupplies ?? 0),
        hazmatFee: Number(formState.hazmatFee ?? 0),
        discounts: Number(formState.discounts ?? 0),
        tax: Number(formState.tax ?? 0),
        notes: formState.notes,
        warrantyNotes: formState.warrantyNotes,
        followUpReminders: formState.followUpReminders.map((reminder) => ({
          description: reminder.description,
          dueDate: reminder.dueDate || null,
        })),
        status: formState.status,
      };

      if (formState.id) {
        await updateInvoice({ variables: { id: formState.id, input: payload } });
        toast.success("Invoice updated");
        await refetchInvoiceDetail();
      } else {
        const result = await createInvoice({ variables: { input: payload } });
        const newId = result.data?.createInvoice?.id;
        if (newId) setSelectedInvoiceId(newId);
        toast.success("Invoice created");
      }
      await refetchInvoices();
      setIsFormOpen(false);
      setFormState(createEmptyInvoiceForm());
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save invoice");
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoiceId) return;
    try {
      await addPayment({
        variables: {
          input: {
            invoiceId: selectedInvoiceId,
            amount: Number(paymentAmount),
            method: paymentMethod,
            reference: paymentReference || null,
          },
        },
      });
      toast.success("Payment applied");
      setIsPaymentOpen(false);
      setPaymentAmount(0);
      setPaymentReference("");
      await Promise.all([refetchInvoices(), refetchInvoiceDetail()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record payment");
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedInvoiceId) return;
    try {
      await updateStatus({ variables: { id: selectedInvoiceId, status } });
      toast.success(`Marked invoice ${status}`);
      await Promise.all([refetchInvoices(), refetchInvoiceDetail()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update status");
    }
  };

  const displayedInvoices = useMemo(() => invoices, [invoices]);
  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Service Billing</h1>
            <p className="text-muted-foreground">Link technician output to revenue the moment a vehicle clears QA. Issue, collect, and audit without leaving the bay.</p>
          </div>
          {canManageInvoices && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => refetchInvoices()}>
                <Filter className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Invoice
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 items-center gap-3">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search invoices" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <Select value={statusFilter ?? "all"} onValueChange={(value) => {
                  setStatusFilter(value === "all" ? undefined : value);
                  setPage(1);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partially Paid</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground">Showing {(page - 1) * 12 + 1}–{Math.min(page * 12, totalInvoices)} of {totalInvoices}</div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayedInvoices.map((invoice) => (
              <button
                key={invoice.id}
                className={`rounded-xl border p-4 text-left transition hover:border-primary hover:shadow ${selectedInvoiceId === invoice.id ? "border-primary shadow" : "border-border"}`}
                onClick={() => setSelectedInvoiceId(invoice.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_BADGE[invoice.status] ?? "bg-muted text-muted-foreground"}>
                        {invoice.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">#{invoice.invoiceNumber}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{invoice.clientName}</h3>
                    <p className="text-xs text-muted-foreground">Due {format(new Date(invoice.dueDate), "MMM d, yyyy")}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold text-foreground">${invoice.totalAmount.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Balance ${invoice.balanceDue.toFixed(2)}</p>
                  </div>
                </div>
                {invoice.serviceLaneTicket && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" /> Ticket {invoice.serviceLaneTicket.ticketNumber}
                  </div>
                )}
              </button>
            ))}
            {displayedInvoices.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No invoices match your filters.</p>}
          </CardContent>
          <CardContent className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">Page {page} of {totalPages}</div>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </Button>
          </CardContent>
        </Card>

        {selectedInvoiceId && activeInvoice && (
          <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
            <Card>
              <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-2xl font-semibold text-foreground">Invoice #{activeInvoice.invoiceNumber}</CardTitle>
                  <p className="text-sm text-muted-foreground">Issued {format(new Date(activeInvoice.issuedDate), "MMM d, yyyy")}</p>
                </div>
                {canManageInvoices && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditInvoice(activeInvoice.id)}>
                      <FileText className="mr-2 h-4 w-4" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setPaymentAmount(Number(activeInvoice.balanceDue.toFixed(2)));
                      setIsPaymentOpen(true);
                    }} disabled={activeInvoice.balanceDue <= 0}>
                      <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleUpdateStatus("paid")} disabled={updatingStatus || activeInvoice.status === "paid"}>
                      <BadgeCheck className="mr-2 h-4 w-4" /> Mark Paid
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-muted/60 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</h3>
                    <p className="mt-2 text-sm font-semibold text-foreground">{activeInvoice.clientName}</p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {activeInvoice.clientEmail && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" /> {activeInvoice.clientEmail}
                        </div>
                      )}
                      {activeInvoice.clientPhone && <div>{activeInvoice.clientPhone}</div>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</h3>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Labor</span>
                        <span>${activeInvoice.laborTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Parts</span>
                        <span>${activeInvoice.partsTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Shop supplies</span>
                        <span>${(activeInvoice.shopSupplies ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Hazmat fee</span>
                        <span>${(activeInvoice.hazmatFee ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Discounts</span>
                        <span>-${(activeInvoice.discounts ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="font-semibold">${activeInvoice.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Balance due</span>
                        <span>${activeInvoice.balanceDue.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <Tabs defaultValue="labor">
                  <TabsList className="w-full md:w-auto">
                    <TabsTrigger value="labor">Labor</TabsTrigger>
                    <TabsTrigger value="parts">Parts</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>
                  <TabsContent value="labor" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service</TableHead>
                          <TableHead>Technician</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activeInvoice.laborLines ?? []).map((line: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="font-medium text-foreground">{line.description}</div>
                              <div className="text-xs text-muted-foreground">{line.servicePackage?.name}</div>
                            </TableCell>
                            <TableCell>{line.technician?.name ?? "—"}</TableCell>
                            <TableCell>{line.hours.toFixed(2)}</TableCell>
                            <TableCell>${line.rate.toFixed(2)}</TableCell>
                            <TableCell>${line.total.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {(!activeInvoice.laborLines || activeInvoice.laborLines.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              No labor lines captured.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  <TabsContent value="parts" className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activeInvoice.partsLines ?? []).map((line: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="font-medium text-foreground">{line.description}</div>
                              <div className="text-xs text-muted-foreground">{line.inventoryItem?.partNumber}</div>
                            </TableCell>
                            <TableCell>{line.quantity}</TableCell>
                            <TableCell>${line.unitPrice.toFixed(2)}</TableCell>
                            <TableCell>${line.total.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {(!activeInvoice.partsLines || activeInvoice.partsLines.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                              No parts billed on this visit.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  <TabsContent value="notes" className="mt-4 space-y-3 text-sm text-muted-foreground">
                    {activeInvoice.notes ? <p>{activeInvoice.notes}</p> : <p>No billing notes recorded.</p>}
                    {activeInvoice.warrantyNotes && (
                      <div className="rounded-md bg-muted/50 p-3">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Warranty</span>
                        <p className="text-foreground">{activeInvoice.warrantyNotes}</p>
                      </div>
                    )}
                    {(activeInvoice.followUpReminders ?? []).map((reminder: any, index: number) => (
                      <div key={index} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                        <Send className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">{reminder.description}</p>
                          {reminder.dueDate && <p className="text-xs text-muted-foreground">Due {format(new Date(reminder.dueDate), "MMM d, yyyy")}</p>}
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>

                <section className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payment History</h3>
                  <Table className="mt-3 text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activeInvoice.payments ?? []).map((payment: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{format(new Date(payment.date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="capitalize">{payment.method}</TableCell>
                          <TableCell>{payment.reference ?? "—"}</TableCell>
                          <TableCell>${payment.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {(!activeInvoice.payments || activeInvoice.payments.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                            No payments recorded yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </section>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Intelligence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-foreground">Capture approvals in-line</p>
                    <p>Attach inspection media and digital signatures from Service Lane Control to eliminate downtime on estimate approvals.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <ArrowDownRight className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-semibold text-foreground">Flag comeback risk</p>
                    <p>Monitor labor lines with repeat comebacks better than 3 within 90 days and auto-trigger QA review.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                  <DollarSign className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Sync with parts usage</p>
                    <p>Reconcile parts issued vs. billed daily to keep margins tight and inventory movements accountable.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? "Edit Invoice" : "New Invoice"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={formState.clientName} onChange={(event) => setFormState((prev) => ({ ...prev, clientName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Advisor</Label>
              <Select value={formState.advisorId ?? ""} onValueChange={(value) => setFormState((prev) => ({ ...prev, advisorId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select advisor" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.filter((member) => member.department === "Front Desk" || member.department === "Service Bays").map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={formState.clientEmail ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, clientEmail: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formState.clientPhone ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, clientPhone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={formState.dueDate} onChange={(event) => setFormState((prev) => ({ ...prev, dueDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Input value={formState.paymentTerms} onChange={(event) => setFormState((prev) => ({ ...prev, paymentTerms: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Service Ticket</Label>
              <Select value={formState.serviceLaneTicketId ?? ""} onValueChange={(value) => setFormState((prev) => ({ ...prev, serviceLaneTicketId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Link a ticket" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {openTickets.map((ticket) => (
                    <SelectItem key={ticket.id} value={ticket.id}>
                      {ticket.ticketNumber} • {ticket.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={formState.description ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))} />
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Labor Lines</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setFormState((prev) => ({
                  ...prev,
                  laborLines: [...prev.laborLines, { servicePackageId: undefined, description: "", technicianId: undefined, hours: 1, rate: 125 }],
                }))}>
                  <Plus className="mr-2 h-4 w-4" /> Add Labor
                </Button>
              </div>
              <div className="space-y-3">
                {formState.laborLines.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-5">
                    <Select value={line.servicePackageId ?? ""} onValueChange={(value) => setFormState((prev) => ({
                      ...prev,
                      laborLines: prev.laborLines.map((l, i) => i === index ? { ...l, servicePackageId: value } : l),
                    }))}>
                      <SelectTrigger className="md:col-span-2">
                        <SelectValue placeholder="Service" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {servicePackages.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        laborLines: prev.laborLines.map((l, i) => i === index ? { ...l, description: event.target.value } : l),
                      }))}
                      className="md:col-span-2"
                    />
                    <Select value={line.technicianId ?? ""} onValueChange={(value) => setFormState((prev) => ({
                      ...prev,
                      laborLines: prev.laborLines.map((l, i) => i === index ? { ...l, technicianId: value } : l),
                    }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tech" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {teamMembers.filter((member) => member.department === "Service Bays" || member.department === "Diagnostics").map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" step="0.1" value={line.hours} onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        laborLines: prev.laborLines.map((l, i) => i === index ? { ...l, hours: Number(event.target.value) } : l),
                      }))} placeholder="Hours" />
                      <Input type="number" value={line.rate} onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        laborLines: prev.laborLines.map((l, i) => i === index ? { ...l, rate: Number(event.target.value) } : l),
                      }))} placeholder="Rate" />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setFormState((prev) => ({
                      ...prev,
                      laborLines: prev.laborLines.filter((_, i) => i !== index),
                    }))}>
                      Remove
                    </Button>
                  </div>
                ))}
                {formState.laborLines.length === 0 && <p className="text-sm text-muted-foreground">No labor lines yet – add at least one service to bill.</p>}
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Parts</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setFormState((prev) => ({
                  ...prev,
                  partsLines: [...prev.partsLines, { inventoryItemId: undefined, description: "", quantity: 1, unitPrice: 0, taxable: true }],
                }))}>
                  <Plus className="mr-2 h-4 w-4" /> Add Part
                </Button>
              </div>
              <div className="space-y-3">
                {formState.partsLines.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[2fr,1fr,1fr,auto]">
                    <Select value={line.inventoryItemId ?? ""} onValueChange={(value) => setFormState((prev) => ({
                      ...prev,
                      partsLines: prev.partsLines.map((l, i) => i === index ? { ...l, inventoryItemId: value } : l),
                    }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Part" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={line.description}
                      onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        partsLines: prev.partsLines.map((l, i) => i === index ? { ...l, description: event.target.value } : l),
                      }))}
                      placeholder="Description"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" value={line.quantity} onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        partsLines: prev.partsLines.map((l, i) => i === index ? { ...l, quantity: Number(event.target.value) } : l),
                      }))} placeholder="Qty" />
                      <Input type="number" value={line.unitPrice} onChange={(event) => setFormState((prev) => ({
                        ...prev,
                        partsLines: prev.partsLines.map((l, i) => i === index ? { ...l, unitPrice: Number(event.target.value) } : l),
                      }))} placeholder="Unit Price" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={line.taxable} onCheckedChange={(checked) => setFormState((prev) => ({
                        ...prev,
                        partsLines: prev.partsLines.map((l, i) => i === index ? { ...l, taxable: !!checked } : l),
                      }))} />
                      <span className="text-xs text-muted-foreground">Taxable</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setFormState((prev) => ({
                      ...prev,
                      partsLines: prev.partsLines.filter((_, i) => i !== index),
                    }))}>
                      Remove
                    </Button>
                  </div>
                ))}
                {formState.partsLines.length === 0 && <p className="text-sm text-muted-foreground">Add parts billed on this repair order.</p>}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Shop Supplies</Label>
                <Input type="number" value={formState.shopSupplies ?? 0} onChange={(event) => setFormState((prev) => ({ ...prev, shopSupplies: Number(event.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Hazmat Fee</Label>
                <Input type="number" value={formState.hazmatFee ?? 0} onChange={(event) => setFormState((prev) => ({ ...prev, hazmatFee: Number(event.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Discounts</Label>
                <Input type="number" value={formState.discounts ?? 0} onChange={(event) => setFormState((prev) => ({ ...prev, discounts: Number(event.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Tax</Label>
                <Input type="number" value={formState.tax ?? 0} onChange={(event) => setFormState((prev) => ({ ...prev, tax: Number(event.target.value) }))} />
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={formState.notes ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Warranty Notes</Label>
              <Textarea rows={2} value={formState.warrantyNotes ?? ""} onChange={(event) => setFormState((prev) => ({ ...prev, warrantyNotes: event.target.value }))} />
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Follow-up Reminders</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setFormState((prev) => ({
                  ...prev,
                  followUpReminders: [...prev.followUpReminders, { description: "", dueDate: undefined }],
                }))}>
                  <Plus className="mr-2 h-4 w-4" /> Add Reminder
                </Button>
              </div>
              <div className="space-y-3">
                {formState.followUpReminders.map((reminder, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
                    <Input placeholder="Reminder description" value={reminder.description} onChange={(event) => setFormState((prev) => ({
                      ...prev,
                      followUpReminders: prev.followUpReminders.map((r, i) => i === index ? { ...r, description: event.target.value } : r),
                    }))} />
                    <Input type="date" value={reminder.dueDate ?? ""} onChange={(event) => setFormState((prev) => ({
                      ...prev,
                      followUpReminders: prev.followUpReminders.map((r, i) => i === index ? { ...r, dueDate: event.target.value } : r),
                    }))} />
                    <Button variant="ghost" size="sm" onClick={() => setFormState((prev) => ({
                      ...prev,
                      followUpReminders: prev.followUpReminders.filter((_, i) => i !== index),
                    }))}>
                      Remove
                    </Button>
                  </div>
                ))}
                {formState.followUpReminders.length === 0 && <p className="text-sm text-muted-foreground">Schedule post-service check-ins or maintenance reminders to keep the customer engaged.</p>}
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Status</Label>
              <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitForm} disabled={creating || updating}>
              {formState.id ? "Save Changes" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Last 4, transaction id, etc" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordingPayment}>Apply Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
