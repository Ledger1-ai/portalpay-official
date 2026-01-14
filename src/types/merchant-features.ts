export interface MerchantFeatureSettings {
    kioskEnabled: boolean;
    terminalEnabled: boolean;
}

export interface TeamMember {
    id: string;
    merchantWallet: string;
    name: string;
    pinHash: string;
    role: "manager" | "staff";
    active: boolean;
    createdAt: number;
    updatedAt?: number;
}
