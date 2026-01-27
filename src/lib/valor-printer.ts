import { formatCurrency } from "@/lib/fx";
import "@/lib/valor-types";

// Text Sizes (adjust based on device DPI, usually 20-30 for normal, 35-40 for header)
const SIZES = {
    SMALL: 20,
    NORMAL: 24,
    LARGE: 32,
    XL: 40
};

export function isValorAvailable(): boolean {
    return typeof window !== "undefined" && !!window.ValorPrint;
}

export async function printValorReport(stats: any, reportType: string, range: string, brandName: string) {
    if (!window.ValorPrint) {
        console.warn("ValorPrint interface not found");
        return false;
    }

    const P = window.ValorPrint;
    const typeTitle = reportType.replace("-", " ").toUpperCase();
    const dateStr = new Date().toLocaleString();
    const rangeStart = stats?.meta?.range?.start
        ? new Date(Math.floor(stats.meta.range.start * 1000)).toLocaleDateString()
        : range;

    try {
        // 1. Initialize
        P.initPrinter();

        // 2. Header
        P.drawtext(brandName || "Merchant Terminal", SIZES.LARGE, true, "CENTER");
        P.drawtext(typeTitle, SIZES.NORMAL, true, "CENTER");
        P.drawtext(`Range: ${rangeStart}`, SIZES.SMALL, false, "CENTER");
        P.drawtext(`Printed: ${dateStr}`, SIZES.SMALL, false, "CENTER");
        P.feedPaper(20);

        // 3. Summary Section
        P.drawtext("SUMMARY", SIZES.NORMAL, true, "LEFT");
        P.drawTwotext("Total Sales", formatCurrency(stats.summary.totalSales, "USD"), SIZES.NORMAL, false);
        P.drawTwotext("Transactions", String(stats.summary.transactionCount), SIZES.NORMAL, false);
        P.drawTwotext("Avg Order", formatCurrency(stats.summary.averageOrderValue, "USD"), SIZES.NORMAL, false);
        P.drawTwotext("Tips", formatCurrency(stats.summary.totalTips, "USD"), SIZES.NORMAL, false);
        P.feedPaper(10);

        // 4. Payment Methods
        if (stats.paymentMethods && stats.paymentMethods.length > 0) {
            P.drawtext("PAYMENTS", SIZES.NORMAL, true, "LEFT");
            stats.paymentMethods.forEach((pm: any) => {
                P.drawTwotext(pm.method, formatCurrency(pm.total, "USD"), SIZES.NORMAL, false);
            });
            P.feedPaper(10);
        }

        // 5. Staff Performance (if applicable)
        if (reportType === "employee" && stats.employees) {
            P.drawtext("STAFF PERFORMANCE", SIZES.NORMAL, true, "LEFT");
            // Headers: ID | Sales
            stats.employees.forEach((e: any) => {
                P.drawTwotext(e.id, formatCurrency(e.sales, "USD"), SIZES.NORMAL, false);
                P.drawTwotext("  Orders", String(e.count), SIZES.SMALL, false);
            });
            P.feedPaper(10);
        }

        // 6. Hourly (if applicable)
        if (reportType === "hourly" && stats.hourly) {
            P.drawtext("HOURLY SALES", SIZES.NORMAL, true, "LEFT");
            stats.hourly
                .filter((h: any) => h.amount > 0)
                .forEach((h: any) => {
                    P.drawTwotext(`${h.hour}:00`, formatCurrency(h.amount, "USD"), SIZES.NORMAL, false);
                });
            P.feedPaper(10);
        }

        // 7. Footer
        P.feedPaper(20);
        P.drawtext("*** END OF REPORT ***", SIZES.SMALL, true, "CENTER");
        P.feedPaper(50); // Cut spacing

        // 8. Print
        P.print();
        return true;

    } catch (e) {
        console.error("Valor Print Error:", e);
        throw e;
    }
}
