export interface ValorPrint {
    initPrinter(): number;
    drawtext(text: string, textSize: number, bold: boolean, align: "LEFT" | "CENTER" | "RIGHT" | string): number;
    drawTwotext(leftText: string, rightText: string, textSize: number, bold: boolean): number;
    drawThreetext(leftText: string, centerText: string, rightText: string, textSize: number, bold: boolean): number;
    drawMultitext(percents: number[], texts: string[], textSize: number, bold: boolean): number;
    drawimage(base64OrPath: string): number; // Usually handles base64 or path in JS bridges
    drawtextOffset(): number;
    drawReverseText(text: string, textSize: number, bold: boolean, align: string): number;
    feedPaper(height: number): number;
    print(): number;
    clearReversal(): number;
}

declare global {
    interface Window {
        ValorPrint?: ValorPrint;
    }
}
