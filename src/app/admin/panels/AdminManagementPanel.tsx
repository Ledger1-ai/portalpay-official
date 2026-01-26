"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { AdminRole } from "@/lib/authz";
import { Trash2, UserPlus, Shield, ShieldAlert, Save } from "lucide-react";
import AdminActivityLog from "./AdminActivityLog";

type AdminUser = {
    wallet: string;
    role: AdminRole;
    name?: string;
    email?: string;
};

export default function AdminManagementPanel() {
    const account = useActiveAccount();
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Form State
    const [isEditing, setIsEditing] = useState(false);
    const [formWallet, setFormWallet] = useState("");
    const [formName, setFormName] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formRole, setFormRole] = useState<AdminRole>("platform_admin");

    // Tab State
    const [activeTab, setActiveTab] = useState<"users" | "activity">("users");

    const fetchAdmins = React.useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const res = await fetch("/api/admin/roles", {
                headers: { "x-wallet": account?.address || "" }
            });
            if (!res.ok) throw new Error("Failed to fetch admins");
            const data = await res.json();
            setAdmins(data.admins || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [account?.address]);

    useEffect(() => {
        fetchAdmins();
    }, [fetchAdmins]);

    async function saveAdmins(newQueue: AdminUser[]) {
        try {
            setLoading(true);
            setError("");
            const res = await fetch("/api/admin/roles", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || ""
                },
                body: JSON.stringify({ admins: newQueue })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");
            setAdmins(data.admins);
            setSuccess("Admin list updated successfully");
            setTimeout(() => setSuccess(""), 3000);

            // Turn off edit mode
            resetForm();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function resetForm() {
        setIsEditing(false);
        setFormWallet("");
        setFormName("");
        setFormEmail("");
        setFormRole("platform_admin");
    }

    function handleStartEdit(admin: AdminUser) {
        setIsEditing(true);
        setFormWallet(admin.wallet);
        setFormName(admin.name || "");
        setFormEmail(admin.email || "");
        setFormRole(admin.role);
        // Scroll to form
        const formEl = document.getElementById("admin-form");
        if (formEl) formEl.scrollIntoView({ behavior: "smooth" });
    }

    function handleSubmit() {
        if (!/^0x[a-fA-F0-9]{40}$/.test(formWallet)) {
            setError("Invalid wallet address");
            return;
        }

        const newUser: AdminUser = {
            wallet: formWallet,
            role: formRole,
            name: formName || "Admin",
            email: formEmail || ""
        };

        let updated: AdminUser[];

        if (isEditing) {
            // Update existing
            updated = admins.map(a => a.wallet.toLowerCase() === formWallet.toLowerCase() ? newUser : a);
        } else {
            // Add new
            if (admins.find(a => a.wallet.toLowerCase() === formWallet.toLowerCase())) {
                setError("User (Wallet) already exists. Use Edit instead.");
                return;
            }
            updated = [...admins, newUser];
        }

        setAdmins(updated); // Optimistic
        saveAdmins(updated);
    }

    function handleRemove(walletToRemove: string) {
        if (!confirm("Are you sure you want to remove this admin?")) return;
        const updated = admins.filter(a => a.wallet.toLowerCase() !== walletToRemove.toLowerCase());
        setAdmins(updated);
        saveAdmins(updated);
    }

    if (activeTab === "activity") {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        Admin Management
                        {/* Activity Log included in separate tab */}
                    </h2>
                    <div className="flex bg-muted rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab("users")}
                            className="px-3 py-1 rounded-md text-sm font-medium transition-all text-muted-foreground hover:text-foreground"
                        >
                            Users
                        </button>
                        <button
                            onClick={() => setActiveTab("activity")}
                            className="px-3 py-1 rounded-md text-sm font-medium transition-all bg-background shadow-sm text-foreground"
                        >
                            Activity
                        </button>
                    </div>
                </div>
                <AdminActivityLog />
            </div>
        );
    }

    if (loading && admins.length === 0) return <div className="p-8 text-center text-muted-foreground">Loading admins...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-500" />
                    Admin Management
                </h2>
                <div className="flex bg-muted rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab("users")}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${activeTab === "users" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Users
                    </button>
                    <button
                        onClick={() => setActiveTab("activity")}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${(activeTab as string) === "activity" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Activity
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-md text-sm">{error}</div>}
            {success && <div className="bg-green-500/10 border border-green-500/20 text-green-500 p-3 rounded-md text-sm">{success}</div>}

            {/* Editor Card */}
            <div id="admin-form" className="glass-pane p-4 border rounded-xl space-y-4 bg-muted/30">
                <h3 className="text-sm font-medium flex items-center gap-2">
                    {isEditing ? <Save className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    {isEditing ? "Edit Admin" : "Add New Admin"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="microtext text-muted-foreground block mb-1">Wallet Address</label>
                        <input
                            type="text"
                            placeholder="0x..."
                            className={`w-full h-9 px-3 border rounded-md bg-background text-sm font-mono ${isEditing ? "opacity-50 cursor-not-allowed" : ""}`}
                            value={formWallet}
                            onChange={(e) => setFormWallet(e.target.value)}
                            disabled={isEditing}
                        />
                    </div>
                    <div>
                        <label className="microtext text-muted-foreground block mb-1">Role</label>
                        <select
                            className="w-full h-9 px-3 border rounded-md bg-background text-sm"
                            value={formRole}
                            onChange={(e) => setFormRole(e.target.value as AdminRole)}
                        >
                            <option value="platform_admin">General Admin</option>
                            <option value="platform_super_admin">Master Admin</option>
                            <option value="partner_admin">Partner Admin</option>
                        </select>
                    </div>
                    <div>
                        <label className="microtext text-muted-foreground block mb-1">Name (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. John Doe"
                            className="w-full h-9 px-3 border rounded-md bg-background text-sm"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="microtext text-muted-foreground block mb-1">Email (Optional)</label>
                        <input
                            type="email"
                            placeholder="john@example.com"
                            className="w-full h-9 px-3 border rounded-md bg-background text-sm"
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    {isEditing && (
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 border hover:bg-muted text-sm rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={!formWallet}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isEditing ? "Update Admin" : "Add Admin"}
                    </button>
                </div>
            </div>

            {/* Admin List */}
            <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 border-b grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-5">User Info</div>
                    <div className="col-span-3">Role</div>
                    <div className="col-span-3">Details</div>
                    <div className="col-span-1 text-right">Action</div>
                </div>
                <div className="divide-y">
                    {admins.map((admin) => (
                        <div key={admin.wallet} className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-muted/20 transition-colors">
                            <div className="col-span-5 overflow-hidden">
                                <div className="font-medium text-sm truncate">{admin.name || "Unknown"}</div>
                                <div className="font-mono text-xs text-muted-foreground truncate" title={admin.wallet}>{admin.wallet}</div>
                                {admin.email && <div className="text-xs text-indigo-400 truncate">{admin.email}</div>}
                            </div>
                            <div className="col-span-3">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border
                            ${admin.role === 'platform_super_admin' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                                        admin.role === 'platform_admin' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                            'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}
                                >
                                    {admin.role.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="col-span-3 text-xs text-muted-foreground">
                                {admin.role === 'platform_super_admin' ? 'Full Control' : 'Restricted Access'}
                            </div>
                            <div className="col-span-1 text-right flex items-center justify-end gap-1">
                                <button
                                    onClick={() => handleStartEdit(admin)}
                                    className="p-2 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10 rounded-full transition-colors"
                                    title="Edit Admin"
                                >
                                    <Save className="w-4 h-4" /> {/* Reusing Save icon as Edit for now, usually Edit icon */}
                                </button>
                                {admin.role !== 'platform_super_admin' || admins.filter(a => a.role === 'platform_super_admin').length > 1 ? (
                                    <button
                                        onClick={() => handleRemove(admin.wallet)}
                                        className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                                        title="Remove Admin"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <span title="Cannot remove last super admin" className="p-2">
                                        <ShieldAlert className="w-4 h-4 text-muted-foreground/30" />
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
