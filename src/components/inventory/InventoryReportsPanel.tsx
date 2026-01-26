"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { useWasteReport, useSupplierPerformance, useRecipeProfitability } from "@/lib/hooks/use-graphql";

export default function InventoryReportsPanel() {
  const [range, setRange] = React.useState(() => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  }));

  const { data: waste } = useWasteReport({ startDate: range.start, endDate: range.end });
  const { data: supplier } = useSupplierPerformance({ startDate: range.start, endDate: range.end });
  const { data: recipe } = useRecipeProfitability();

  const wasteRows = waste?.wasteReport?.byItem || [];
  const supplierRows = supplier?.supplierPerformanceReport || [];
  const recipeRows = recipe?.recipeProfitabilityReport || [];

  const exportAll = async (format: "csv" | "xlsx" | "pdf") => {
    const filename = `inventory-reports-${range.start}-to-${range.end}`;
    if (format === "csv") {
      const { exportCSV } = await import("@/lib/reporting/exports");
      exportCSV(`${filename}-waste.csv`, wasteRows);
      exportCSV(`${filename}-supplier.csv`, supplierRows);
      exportCSV(`${filename}-recipe.csv`, recipeRows);
    } else if (format === "xlsx") {
      const { exportXLSXMulti } = await import("@/lib/reporting/exports");
      await exportXLSXMulti(`${filename}.xlsx`, [
        { name: "Waste by Item", rows: wasteRows },
        { name: "Supplier Performance", rows: supplierRows },
        { name: "Recipe Profitability", rows: recipeRows },
      ]);
    } else {
      const { exportPDFReport } = await import("@/lib/reporting/exports");
      await exportPDFReport(`${filename}.pdf`, [
        {
          title: "Waste by Item", columns: [
            { header: "Item", dataKey: "name" },
            { header: "Qty", dataKey: "quantity" },
            { header: "Cost", dataKey: "cost" },
          ], rows: wasteRows
        },
        {
          title: "Supplier Performance", columns: [
            { header: "Supplier", dataKey: "supplierName" },
            { header: "Orders", dataKey: "totalOrders" },
            { header: "Spent", dataKey: "totalSpent" },
            { header: "AOV", dataKey: "averageOrderValue" },
            { header: "On-Time %", dataKey: "onTimeDeliveryRate" },
            { header: "Quality", dataKey: "qualityRating" },
          ], rows: supplierRows
        },
        {
          title: "Recipe Profitability", columns: [
            { header: "Recipe", dataKey: "name" },
            { header: "Food Cost", dataKey: "foodCost" },
            { header: "Price", dataKey: "menuPrice" },
            { header: "FoodCost%", dataKey: "foodCostPct" },
            { header: "Margin", dataKey: "grossMargin" },
          ], rows: recipeRows
        },
      ]);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Reports</CardTitle>
              <CardDescription>Export prebuilt reports across panels</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">From</span>
              <Input type="date" value={range.start} onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))} className="w-36" />
              <span className="text-sm">To</span>
              <Input type="date" value={range.end} onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))} className="w-36" />
              <Button variant="outline" onClick={() => exportAll("csv")}><Download className="mr-2 h-4 w-4" />CSV</Button>
              <Button variant="outline" onClick={() => exportAll("xlsx")}><Download className="mr-2 h-4 w-4" />Excel</Button>
              <Button variant="outline" onClick={() => exportAll("pdf")}><Download className="mr-2 h-4 w-4" />PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Waste by Item</div>
              <div className="text-muted-foreground">Top items contributing to waste by cost and quantity</div>
            </div>
            <div>
              <div className="font-medium mb-1">Supplier Performance</div>
              <div className="text-muted-foreground">On-time delivery, quality ratings and spend</div>
            </div>
            <div>
              <div className="font-medium mb-1">Recipe Profitability</div>
              <div className="text-muted-foreground">Cost, price and margin for menu items</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


