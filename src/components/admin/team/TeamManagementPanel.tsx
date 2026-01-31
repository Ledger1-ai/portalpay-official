"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface TeamPanelProps {
    merchantWallet: string;
    theme?: any;
}

export default function TeamManagementPanel({ merchantWallet, theme }: TeamPanelProps) {
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingMember, setEditingMember] = useState<any>(null);

    useEffect(() => {
        if (merchantWallet) loadTeam();
    }, [merchantWallet]);

    async function loadTeam() {
        setLoading(true);
        try {
            const res = await fetch(`/api/terminal/team`, {
                headers: { "x-wallet": merchantWallet }
            });
            const data = await res.json();
            setMembers(data.members || []);
        } catch (e) {
            console.error("Failed to load team", e);
        } finally {
            setLoading(false);
        }
    }

    async function deleteMember(id: string) {
        if (!confirm("Are you sure you want to remove this team member?")) return;
        try {
            await fetch(`/api/terminal/team`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                body: JSON.stringify({ id })
            });
            loadTeam();
        } catch (e) {
            alert("Failed to delete member");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Team Members</h2>
                <button
                    onClick={() => { setEditingMember(null); setShowAddModal(true); }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:brightness-110 transition-all text-sm"
                    style={{ backgroundColor: theme?.primaryColor }}
                >
                    + Add Member
                </button>
            </div>

            {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : members.length === 0 ? (
                <div className="text-center py-12 bg-black/20 border border-white/5 rounded-xl">
                    <div className="text-muted-foreground mb-4 text-sm">No team members configured for this merchant.</div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="text-primary hover:underline text-sm font-medium"
                        style={{ color: theme?.primaryColor }}
                    >
                        Add the first team member
                    </button>
                </div>
            ) : (
                <div className="grid gap-3">
                    {members.map((member) => (
                        <div
                            key={member.id}
                            className="bg-black/20 border border-white/5 rounded-xl p-4 flex items-center justify-between"
                        >
                            <div>
                                <div className="font-semibold text-white">{member.name}</div>
                                <div className="text-xs text-muted-foreground capitalize">
                                    {member.role || "Staff"}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setEditingMember(member); setShowAddModal(true); }}
                                    className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => deleteMember(member.id)}
                                    className="px-3 py-1.5 text-xs border border-white/10 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && typeof window !== "undefined" && createPortal(
                <TeamMemberModal
                    member={editingMember}
                    merchantWallet={merchantWallet}
                    theme={theme}
                    onClose={() => { setShowAddModal(false); setEditingMember(null); }}
                    onSave={() => { setShowAddModal(false); setEditingMember(null); loadTeam(); }}
                />,
                document.body
            )}
        </div>
    );
}

function TeamMemberModal({
    member,
    merchantWallet,
    theme,
    onClose,
    onSave
}: {
    member: any;
    merchantWallet: string;
    theme?: any;
    onClose: () => void;
    onSave: () => void;
}) {
    const [name, setName] = useState(member?.name || "");
    const [role, setRole] = useState(member?.role || "staff");
    const [pin, setPin] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            alert("Name is required");
            return;
        }
        if (!member && (!pin || pin.length < 4)) {
            alert("PIN must be at least 4 digits");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/terminal/team", {
                method: member ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                body: JSON.stringify({
                    id: member?.id,
                    name: name.trim(),
                    role,
                    pin: pin || undefined
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to save");
            }

            onSave();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">
                        {member ? "Edit Team Member" : "Add Team Member"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-zinc-400">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full px-3 py-2 border border-white/10 rounded-lg bg-black/20 text-white focus:outline-none focus:border-white/30"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-zinc-400">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-3 py-2 border border-white/10 rounded-lg bg-black/20 text-white focus:outline-none focus:border-white/30 [&>option]:bg-zinc-900"
                        >
                            <option value="staff">Staff</option>
                            <option value="keyholder">Keyholder</option>
                            <option value="manager">Manager</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-zinc-400">
                            {member ? "New PIN (leave blank to keep)" : "PIN"}
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d*"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="••••"
                            className="w-full px-3 py-2 border border-white/10 rounded-lg bg-black/20 font-mono text-center text-xl tracking-widest text-white focus:outline-none focus:border-white/30"
                            maxLength={6}
                        />
                        <div className="text-xs text-muted-foreground mt-1 text-zinc-500">4-6 digits</div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-white/10 rounded-lg font-semibold hover:bg-white/5 text-zinc-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-3 bg-primary text-black rounded-lg font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
                            style={{ backgroundColor: theme?.primaryColor || '#fff' }}
                        >
                            {loading ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
