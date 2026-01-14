"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useActiveAccount } from "thirdweb/react";
import {
    Plus, Trash2, User, Shield, ChevronLeft,
    Clock, DollarSign, CheckCircle, XCircle,
    TrendingUp, Calendar, Settings, History,
    Award, Wallet, Edit2, Save, X, Activity,
    BarChart3, CreditCard
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { TeamMember } from "@/types/merchant-features";

type Session = {
    id: string;
    startTime: number;
    endTime?: number;
    totalSales?: number;
    totalTips?: number;
    tipsPaid?: boolean;
    tipsPaidAt?: number;
};

type MemberStats = {
    totalSales: number;
    totalTips: number;
    unpaidTips: number;
    sessionCount: number;
    avgSalePerSession: number;
    lastActive: number;
};

type TabType = "overview" | "sessions" | "tips" | "performance" | "settings";

export default function TeamPanel() {
    const account = useActiveAccount();
    const [stats, setStats] = useState<{
        sales: Record<string, number>,
        sessions: Record<string, number>,
        tips: Record<string, number>,
        unpaidTips: Record<string, number>
    }>({ sales: {}, sessions: {}, tips: {}, unpaidTips: {} });
    const [processingPayout, setProcessingPayout] = useState<string | null>(null);

    // Member State
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Selected member detail view
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>("overview");
    const [memberSessions, setMemberSessions] = useState<Session[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);

    // Edit mode for member settings
    const [editMode, setEditMode] = useState(false);
    const [editName, setEditName] = useState("");
    const [editPin, setEditPin] = useState("");
    const [editRole, setEditRole] = useState<"manager" | "staff">("staff");
    const [saving, setSaving] = useState(false);

    // Add Member State
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPin, setNewPin] = useState("");
    const [newRole, setNewRole] = useState<"manager" | "staff">("staff");
    const [addLoading, setAddLoading] = useState(false);

    async function loadTeam() {
        try {
            setLoading(true);
            setError("");
            const headers = { "x-wallet": account?.address || "" };

            const [rTeam, rStats] = await Promise.all([
                fetch("/api/merchant/team", { headers }),
                fetch("/api/merchant/team/stats", { headers })
            ]);

            const jTeam = await rTeam.json();
            const jStats = await rStats.json();

            if (!rTeam.ok) throw new Error(jTeam.error || "Failed to load team");

            setMembers(jTeam.items || []);
            if (rStats.ok) {
                setStats({
                    sales: jStats.sales || {},
                    sessions: jStats.sessions || {},
                    tips: jStats.tips || {},
                    unpaidTips: jStats.unpaidTips || {}
                });
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadMemberSessions(memberId: string) {
        try {
            setSessionsLoading(true);
            const res = await fetch(`/api/merchant/team/sessions?memberId=${encodeURIComponent(memberId)}`, {
                headers: { "x-wallet": account?.address || "" }
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.sessions)) {
                setMemberSessions(data.sessions);
            } else {
                setMemberSessions([]);
            }
        } catch (e) {
            console.error("Failed to load sessions", e);
            setMemberSessions([]);
        } finally {
            setSessionsLoading(false);
        }
    }

    function openMemberDetail(member: TeamMember) {
        setSelectedMember(member);
        setActiveTab("overview");
        setEditMode(false);
        setEditName(member.name);
        setEditPin("");
        setEditRole(member.role);
        loadMemberSessions(member.id);
    }

    function closeMemberDetail() {
        setSelectedMember(null);
        setMemberSessions([]);
        setEditMode(false);
    }

    useEffect(() => {
        if (account?.address) loadTeam();
    }, [account?.address]);

    async function handleAdd() {
        if (!newName || !newPin) return;
        try {
            setAddLoading(true);
            const r = await fetch("/api/merchant/team", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || ""
                },
                body: JSON.stringify({ name: newName, pin: newPin, role: newRole })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to add member");

            setMembers(prev => [...prev, j.item]);
            setIsAddOpen(false);
            setNewName("");
            setNewPin("");
            setNewRole("staff");
        } catch (e: any) {
            alert(e.message);
        } finally {
            setAddLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to remove this team member? This action cannot be undone.")) return;
        try {
            const r = await fetch(`/api/merchant/team?id=${id}`, {
                method: "DELETE",
                headers: { "x-wallet": account?.address || "" }
            });
            if (!r.ok) throw new Error("Failed to delete");
            setMembers(prev => prev.filter(m => m.id !== id));
            if (selectedMember?.id === id) {
                closeMemberDetail();
            }
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function handleUpdateMember() {
        if (!selectedMember || !editName) return;
        try {
            setSaving(true);
            const body: any = {
                id: selectedMember.id,
                name: editName,
                role: editRole
            };
            if (editPin) body.pin = editPin;

            const r = await fetch("/api/merchant/team", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || ""
                },
                body: JSON.stringify(body)
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to update");

            // Update local state
            setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, name: editName, role: editRole } : m));
            setSelectedMember({ ...selectedMember, name: editName, role: editRole });
            setEditMode(false);
            setEditPin("");
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handlePayout(staffId: string) {
        if (!confirm("Mark all unpaid tips as PAID for this employee? This will close out all their finished sessions.")) return;
        try {
            setProcessingPayout(staffId);
            const r = await fetch("/api/merchant/team/payout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || ""
                },
                body: JSON.stringify({ staffId })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Payout failed");

            alert(`Successfully paid out ${j.count} sessions.`);
            loadTeam();
            if (selectedMember?.id === staffId) {
                loadMemberSessions(staffId);
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setProcessingPayout(null);
        }
    }

    // Compute member stats
    const memberStats = useMemo((): MemberStats | null => {
        if (!selectedMember) return null;
        const id = selectedMember.id;
        const totalSales = stats.sales[id] || 0;
        const totalTips = stats.tips[id] || 0;
        const unpaidTips = stats.unpaidTips[id] || 0;
        const sessionCount = memberSessions.length;
        const avgSalePerSession = sessionCount > 0 ? totalSales / sessionCount : 0;
        const lastActive = stats.sessions[id] || 0;
        return { totalSales, totalTips, unpaidTips, sessionCount, avgSalePerSession, lastActive };
    }, [selectedMember, stats, memberSessions]);

    if (!account) return <div className="p-4 text-muted-foreground">Please connect wallet.</div>;

    const formatMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
    const formatDate = (ts: number) => ts ? format(new Date(ts * 1000), "MMM d, h:mm a") : "-";
    const formatDateTime = (ts: number) => ts ? format(new Date(ts * 1000), "MMM d, yyyy h:mm a") : "-";
    const formatTimeAgo = (ts: number) => ts ? formatDistanceToNow(new Date(ts * 1000), { addSuffix: true }) : "Never";

    // Tab content renderers
    function renderOverviewTab() {
        if (!selectedMember || !memberStats) return null;
        return (
            <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                            <DollarSign size={16} />
                            <span className="text-xs font-medium uppercase tracking-wide">Total Sales</span>
                        </div>
                        <div className="text-2xl font-bold">{formatMoney(memberStats.totalSales)}</div>
                    </div>
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-green-500/10 to-green-600/5">
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                            <Award size={16} />
                            <span className="text-xs font-medium uppercase tracking-wide">Total Tips</span>
                        </div>
                        <div className="text-2xl font-bold">{formatMoney(memberStats.totalTips)}</div>
                    </div>
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-amber-500/10 to-amber-600/5">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                            <Wallet size={16} />
                            <span className="text-xs font-medium uppercase tracking-wide">Unpaid Tips</span>
                        </div>
                        <div className="text-2xl font-bold">{formatMoney(memberStats.unpaidTips)}</div>
                        {memberStats.unpaidTips > 0 && (
                            <button
                                onClick={() => handlePayout(selectedMember.id)}
                                disabled={processingPayout === selectedMember.id}
                                className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                {processingPayout === selectedMember.id ? "Processing..." : "Pay Now"}
                            </button>
                        )}
                    </div>
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-purple-500/10 to-purple-600/5">
                        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                            <Activity size={16} />
                            <span className="text-xs font-medium uppercase tracking-wide">Sessions</span>
                        </div>
                        <div className="text-2xl font-bold">{memberStats.sessionCount}</div>
                    </div>
                </div>

                {/* Quick Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border">
                        <h4 className="font-medium mb-3 flex items-center gap-2"><TrendingUp size={16} /> Performance</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Avg. Sale per Session</span>
                                <span className="font-medium">{formatMoney(memberStats.avgSalePerSession)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Tip Rate</span>
                                <span className="font-medium">
                                    {memberStats.totalSales > 0 ? ((memberStats.totalTips / memberStats.totalSales) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 rounded-xl border">
                        <h4 className="font-medium mb-3 flex items-center gap-2"><Clock size={16} /> Activity</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Last Active</span>
                                <span className="font-medium">{formatTimeAgo(memberStats.lastActive)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Member Since</span>
                                <span className="font-medium">{formatDate((selectedMember as any).createdAt || 0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Sessions Preview */}
                <div className="rounded-xl border overflow-hidden">
                    <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2"><History size={16} /> Recent Sessions</h4>
                        <button onClick={() => setActiveTab("sessions")} className="text-xs text-primary hover:underline">View All</button>
                    </div>
                    {sessionsLoading ? (
                        <div className="p-4 text-muted-foreground text-sm">Loading...</div>
                    ) : memberSessions.length === 0 ? (
                        <div className="p-4 text-muted-foreground text-sm">No sessions recorded yet.</div>
                    ) : (
                        <div className="divide-y">
                            {memberSessions.slice(0, 3).map(s => (
                                <div key={s.id} className="p-4 flex items-center justify-between text-sm">
                                    <div>
                                        <div className="font-medium">{formatDateTime(s.startTime)}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {s.endTime ? `Ended ${formatTimeAgo(s.endTime)}` : "Currently Active"}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-medium">{formatMoney(s.totalSales || 0)}</div>
                                        <div className="text-xs text-green-600">+{formatMoney(s.totalTips || 0)} tips</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    function renderSessionsTab() {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium">All Sessions</h4>
                    <span className="text-sm text-muted-foreground">{memberSessions.length} total</span>
                </div>
                {sessionsLoading ? (
                    <div className="text-muted-foreground">Loading sessions...</div>
                ) : memberSessions.length === 0 ? (
                    <div className="text-center py-12 border rounded-xl border-dashed">
                        <Clock className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                        <div className="text-sm font-medium">No Sessions Found</div>
                        <div className="text-xs text-muted-foreground mt-1">Sessions will appear here after clock-ins.</div>
                    </div>
                ) : (
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left px-4 py-3 font-medium">Date</th>
                                    <th className="text-left px-4 py-3 font-medium">Clock In</th>
                                    <th className="text-left px-4 py-3 font-medium">Clock Out</th>
                                    <th className="text-right px-4 py-3 font-medium">Sales</th>
                                    <th className="text-right px-4 py-3 font-medium">Tips</th>
                                    <th className="text-center px-4 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {memberSessions.map(s => (
                                    <tr key={s.id} className="hover:bg-muted/10">
                                        <td className="px-4 py-3">{format(new Date(s.startTime * 1000), "MMM d, yyyy")}</td>
                                        <td className="px-4 py-3">{format(new Date(s.startTime * 1000), "h:mm a")}</td>
                                        <td className="px-4 py-3">{s.endTime ? format(new Date(s.endTime * 1000), "h:mm a") : <span className="text-green-600 font-medium">Active</span>}</td>
                                        <td className="px-4 py-3 text-right font-medium">{formatMoney(s.totalSales || 0)}</td>
                                        <td className="px-4 py-3 text-right text-green-600">{formatMoney(s.totalTips || 0)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {s.tipsPaid ? (
                                                <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} /> Paid</span>
                                            ) : s.endTime ? (
                                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><XCircle size={12} /> Unpaid</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    function renderTipsTab() {
        const paidSessions = memberSessions.filter(s => s.tipsPaid);
        const unpaidSessions = memberSessions.filter(s => !s.tipsPaid && s.endTime && (s.totalTips || 0) > 0);
        const totalPaid = paidSessions.reduce((sum, s) => sum + (s.totalTips || 0), 0);
        const totalUnpaid = unpaidSessions.reduce((sum, s) => sum + (s.totalTips || 0), 0);

        return (
            <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border bg-green-500/5">
                        <div className="text-sm text-green-600 dark:text-green-400 mb-1">Total Paid Out</div>
                        <div className="text-2xl font-bold text-green-600">{formatMoney(totalPaid)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{paidSessions.length} sessions</div>
                    </div>
                    <div className="p-4 rounded-xl border bg-amber-500/5">
                        <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">Pending Payout</div>
                        <div className="text-2xl font-bold text-amber-600">{formatMoney(totalUnpaid)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{unpaidSessions.length} sessions</div>
                        {totalUnpaid > 0 && selectedMember && (
                            <button
                                onClick={() => handlePayout(selectedMember.id)}
                                disabled={processingPayout === selectedMember.id}
                                className="mt-3 w-full text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                            >
                                {processingPayout === selectedMember.id ? "Processing..." : "Pay All Unpaid Tips"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Tip History */}
                <div className="rounded-xl border overflow-hidden">
                    <div className="p-4 border-b bg-muted/30">
                        <h4 className="font-medium">Tip History</h4>
                    </div>
                    {memberSessions.filter(s => (s.totalTips || 0) > 0).length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <CreditCard className="mx-auto h-8 w-8 mb-2" />
                            <div className="text-sm">No tips recorded yet.</div>
                        </div>
                    ) : (
                        <div className="divide-y max-h-96 overflow-y-auto">
                            {memberSessions.filter(s => (s.totalTips || 0) > 0).map(s => (
                                <div key={s.id} className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-sm">{formatDateTime(s.startTime)}</div>
                                        <div className="text-xs text-muted-foreground">Sale: {formatMoney(s.totalSales || 0)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-green-600">{formatMoney(s.totalTips || 0)}</div>
                                        <div className={`text-xs ${s.tipsPaid ? "text-green-600" : "text-amber-600"}`}>
                                            {s.tipsPaid ? `Paid ${s.tipsPaidAt ? formatTimeAgo(s.tipsPaidAt) : ""}` : "Pending"}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    function renderPerformanceTab() {
        if (!memberStats) return null;

        // Calculate some performance metrics
        const sessionsWithSales = memberSessions.filter(s => (s.totalSales || 0) > 0);
        const bestSession = sessionsWithSales.reduce((best, s) => (s.totalSales || 0) > (best?.totalSales || 0) ? s : best, sessionsWithSales[0]);
        const avgSessionDuration = memberSessions.filter(s => s.endTime).reduce((sum, s) => sum + ((s.endTime! - s.startTime) / 3600), 0) / Math.max(1, memberSessions.filter(s => s.endTime).length);

        return (
            <div className="space-y-6">
                {/* Performance Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg. Session Sales</div>
                        <div className="text-xl font-bold">{formatMoney(memberStats.avgSalePerSession)}</div>
                    </div>
                    <div className="p-4 rounded-xl border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tip Rate</div>
                        <div className="text-xl font-bold">
                            {memberStats.totalSales > 0 ? ((memberStats.totalTips / memberStats.totalSales) * 100).toFixed(1) : 0}%
                        </div>
                    </div>
                    <div className="p-4 rounded-xl border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg. Session Length</div>
                        <div className="text-xl font-bold">{avgSessionDuration.toFixed(1)} hrs</div>
                    </div>
                </div>

                {/* Best Session */}
                {bestSession && (
                    <div className="p-4 rounded-xl border bg-gradient-to-br from-yellow-500/10 to-amber-500/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Award className="text-amber-500" size={18} />
                            <span className="font-medium">Best Session</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm text-muted-foreground">{formatDateTime(bestSession.startTime)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold">{formatMoney(bestSession.totalSales || 0)}</div>
                                <div className="text-sm text-green-600">+{formatMoney(bestSession.totalTips || 0)} tips</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Activity Chart Placeholder */}
                <div className="p-6 rounded-xl border bg-muted/20 text-center">
                    <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <div className="text-sm text-muted-foreground">Performance charts coming soon</div>
                </div>
            </div>
        );
    }

    function renderSettingsTab() {
        if (!selectedMember) return null;

        return (
            <div className="space-y-6">
                {/* Edit Profile */}
                <div className="rounded-xl border overflow-hidden">
                    <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                        <h4 className="font-medium">Profile Settings</h4>
                        {!editMode ? (
                            <button onClick={() => setEditMode(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Edit2 size={12} /> Edit
                            </button>
                        ) : (
                            <button onClick={() => setEditMode(false)} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                                <X size={12} /> Cancel
                            </button>
                        )}
                    </div>
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1">Name</label>
                            {editMode ? (
                                <input
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                />
                            ) : (
                                <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center">{selectedMember.name}</div>
                            )}
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1">Role</label>
                            {editMode ? (
                                <select
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    value={editRole}
                                    onChange={e => setEditRole(e.target.value as any)}
                                >
                                    <option value="staff">Staff</option>
                                    <option value="manager">Manager</option>
                                </select>
                            ) : (
                                <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center capitalize">{selectedMember.role}</div>
                            )}
                        </div>
                        {editMode && (
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">New PIN (leave blank to keep current)</label>
                                <input
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    type="password"
                                    inputMode="numeric"
                                    placeholder="••••"
                                    value={editPin}
                                    onChange={e => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                />
                            </div>
                        )}
                        {editMode && (
                            <button
                                onClick={handleUpdateMember}
                                disabled={saving || !editName}
                                className="w-full h-10 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Save size={16} />
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        )}
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="rounded-xl border border-red-500/30 overflow-hidden">
                    <div className="p-4 border-b border-red-500/30 bg-red-500/5">
                        <h4 className="font-medium text-red-600">Danger Zone</h4>
                    </div>
                    <div className="p-4">
                        <p className="text-sm text-muted-foreground mb-4">Removing this team member will revoke their access. Their historical data will be preserved.</p>
                        <button
                            onClick={() => handleDelete(selectedMember.id)}
                            className="px-4 py-2 border border-red-500 text-red-600 rounded-lg text-sm font-medium hover:bg-red-500/10 flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            Remove Team Member
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Member Detail View
    if (selectedMember) {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button onClick={closeMemberDetail} className="p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                            {selectedMember.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{selectedMember.name}</h2>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${selectedMember.role === 'manager'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}>
                                {selectedMember.role === 'manager' ? <Shield size={10} /> : <User size={10} />}
                                {selectedMember.role.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-muted/50 rounded-xl">
                    {([
                        { key: "overview", label: "Overview", icon: Activity },
                        { key: "sessions", label: "Sessions", icon: Clock },
                        { key: "tips", label: "Tips", icon: CreditCard },
                        { key: "performance", label: "Performance", icon: TrendingUp },
                        { key: "settings", label: "Settings", icon: Settings },
                    ] as { key: TabType; label: string; icon: any }[]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <tab.icon size={16} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                    {activeTab === "overview" && renderOverviewTab()}
                    {activeTab === "sessions" && renderSessionsTab()}
                    {activeTab === "tips" && renderTipsTab()}
                    {activeTab === "performance" && renderPerformanceTab()}
                    {activeTab === "settings" && renderSettingsTab()}
                </div>
            </div>
        );
    }

    // Team List View
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Team Management</h2>
                    <p className="text-muted-foreground text-sm">Manage employees, view performance, and handle payouts.</p>
                </div>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                    <Plus size={16} /> Add Member
                </button>
            </div>

            {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-lg text-sm">{error}</div>}

            {/* Add Member Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-background rounded-2xl border shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Add Team Member</h3>
                            <button onClick={() => setIsAddOpen(false)} className="p-1 rounded hover:bg-muted/50"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                                <input
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">PIN Code (4-6 digits)</label>
                                <input
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    value={newPin}
                                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="••••"
                                    type="password"
                                    inputMode="numeric"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Role</label>
                                <select
                                    className="w-full h-10 px-3 rounded-lg border bg-background"
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as any)}
                                >
                                    <option value="staff">Staff</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setIsAddOpen(false)}
                                className="flex-1 h-10 border rounded-lg text-sm font-medium hover:bg-muted/50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={addLoading || !newName || !newPin}
                                className="flex-1 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                            >
                                {addLoading ? "Adding..." : "Add Member"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Team Grid */}
            {loading ? (
                <div className="text-sm text-muted-foreground">Loading team...</div>
            ) : members.length === 0 ? (
                <div className="text-center py-16 border rounded-2xl border-dashed">
                    <User className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <div className="text-lg font-medium">No Team Members</div>
                    <div className="text-sm text-muted-foreground mt-1">Add employees to enable PIN login on terminals and track performance.</div>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                    >
                        <Plus size={16} /> Add First Member
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {members.map(m => (
                        <button
                            key={m.id}
                            onClick={() => openMemberDetail(m)}
                            className="text-left p-4 rounded-xl border bg-background hover:border-primary/50 hover:shadow-lg transition-all group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-bold group-hover:scale-105 transition-transform">
                                    {m.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{m.name}</div>
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${m.role === 'manager'
                                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}>
                                        {m.role === 'manager' ? <Shield size={10} /> : <User size={10} />}
                                        {m.role}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <div className="text-muted-foreground">Sales</div>
                                    <div className="font-bold text-base">{formatMoney(stats.sales[m.id] || 0)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Unpaid Tips</div>
                                    <div className={`font-bold text-base ${(stats.unpaidTips[m.id] || 0) > 0 ? "text-green-600" : ""}`}>
                                        {formatMoney(stats.unpaidTips[m.id] || 0)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Last active: {formatTimeAgo(stats.sessions[m.id] || 0)}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
