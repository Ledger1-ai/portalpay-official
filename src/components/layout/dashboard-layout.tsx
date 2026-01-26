"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { marked } from "marked";
import { usePermissions, ROLE_PERMISSIONS, Role } from "@/lib/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGlobalSearch } from "@/lib/hooks/use-graphql";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Menu,
  Home,
  CalendarClock,
  Package,
  Receipt,
  Users,
  Settings,
  BarChart3,
  Brain,
  LogOut,
  MessageSquare,
  Bell,
  Search,
  Bot,
  Gauge,
  Wrench,
  History,
  Plus,
  Maximize2,
  Minimize2,
  Mic,
  Keyboard,
} from "lucide-react";
import Image from "next/image";
import { VoiceChat } from "../varuni/chat/voice-chat";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface User {
  email: string;
  name: string;
  role: string;
  permissions?: string[];
}

interface SidebarItem {
  title: string;
  href: string;
  icon: any;
  permission?: string;
  disabled?: boolean;
  tag?: string;
}

const sidebarItems: SidebarItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: Home,
    permission: "dashboard" as const,
  },
  {
    title: "Technician Scheduling",
    href: "/dashboard/scheduling",
    icon: CalendarClock,
    permission: "scheduling" as const,
  },
  {
    title: "Parts Inventory",
    href: "/dashboard/inventory",
    icon: Package,
    permission: "inventory" as const,
  },
  {
    title: "Service Billing",
    href: "/dashboard/invoicing",
    icon: Receipt,
    permission: "invoicing" as const,
  },
  {
    title: "Service Catalog",
    href: "/dashboard/menu",
    icon: Wrench,
    permission: "menu" as const,
  },
  {
    title: "Shop Team",
    href: "/dashboard/team",
    icon: Users,
    permission: "team" as const,
  },
  {
    title: "Service Lane Control",
    href: "/dashboard/hostpro",
    icon: Gauge,
    permission: "hostpro" as const,
  },
  {
    title: "Automation & Equipment",
    href: "/dashboard/robotic-fleets",
    icon: Bot,
    permission: "robotic-fleets" as const,
  },
  {
    title: "Shop Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    permission: "analytics" as const,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    permission: "settings" as const,
  },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const permissions = usePermissions();
  const [user, setUser] = useState<User | null>(null);
  const [isVaruniOpen, setIsVaruniOpen] = useState(false);
  const [isVaruniLarge, setIsVaruniLarge] = useState(false);
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<Array<{ id: string; title?: string; updatedAt?: string }>>([]);
  const [tokenTotal, setTokenTotal] = useState<number>(0);
  const [contextTokens, setContextTokens] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text?: string; html?: string }>>([]);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const streamingTurnRef = useRef<string | null>(null);

  const sendMessage = async () => {
    const input = chatInputRef.current;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    input.value = '';
    try {
      setChatStatus('Thinking...');
      const url = new URL('/api/varuni/chat', window.location.origin);
      if (sessionId) url.searchParams.set('sessionId', sessionId);
      const currentTurnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ; (window as any).__varuni_turn_id__ = currentTurnId;
      ; (window as any).__varuni_expect_sse__ = true;
      ; (window as any).__varuni_saw_final__ = false;
      ; (window as any).__varuni_sse_failed__ = false;
      streamingTurnRef.current = currentTurnId;
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : ''
        },
        body: JSON.stringify({ message: text, runtime: { parallelReads: true }, turnId: currentTurnId })
      });
      const json = await res.json();
      if (json.sessionId) setSessionId(json.sessionId);
      if (typeof json.tokenTotal === 'number') setTokenTotal(json.tokenTotal);
      if (typeof json.contextTokens === 'number') setContextTokens(json.contextTokens);
      // Prefer SSE rendering; append JSON only if SSE failed or not expected
      const expectSse = !!(window as any).__varuni_expect_sse__;
      const sawFinal = !!(window as any).__varuni_saw_final__;
      const sseFailed = !!(window as any).__varuni_sse_failed__;
      if (!expectSse || sseFailed || !sawFinal) {
        setChatMessages(prev => [...prev, { role: 'assistant', html: json.html, text: json.text }]);
      }
      (window as any).__varuni_saw_final__ = false;
      // Persist visible list of tools used (compact, after reply)
      try {
        const names = new Set<string>();
        if (Array.isArray(json.usedTools)) for (const ut of json.usedTools) if (ut?.name) names.add(ut.name as string);
        const evs = Array.isArray(json.events) ? json.events : [];
        for (const ev of evs) { if (ev?.kind === 'tool_start' && ev?.tool) names.add(ev.tool as string); }
        if (names.size) {
          setChatMessages(prev => [...prev, { role: 'assistant', text: `Tools: ${Array.from(names).join(', ')}` }]);
        }
      } catch { }
      // Ephemeral tool status summary (aggregated after completion)
      try {
        const names = new Set<string>();
        const evs = Array.isArray(json.events) ? json.events : [];
        for (const ev of evs) {
          if (ev.kind === 'tool_start' && ev.tool) names.add(ev.tool);
        }
        if ((!names.size) && Array.isArray(json.usedTools)) {
          for (const ut of json.usedTools) if (ut?.name) names.add(ut.name);
        }
        if (names.size) {
          setChatStatus(`Using ${Array.from(names).join(', ')}…`);
          setTimeout(() => setChatStatus(null), 2000);
        } else {
          setChatStatus(null);
        }
      } catch { setChatStatus(null); }
    } catch (err) {
      console.error('Varuni chat error', err);
      setChatMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Unable to reach Varuni'}` }]);
      setChatStatus(null);
    }
  };
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const [deniedOpen, setDeniedOpen] = useState(false);

  // Debounce search queries for UX & performance
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isIdleTyping, setIsIdleTyping] = useState(false);
  useEffect(() => {
    setIsIdleTyping(true);
    const id = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setIsIdleTyping(false);
    }, 250); // Shorter debounce for snappier results
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    const handler = () => setIsVaruniOpen(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('open-varuni', handler as any);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('open-varuni', handler as any);
      }
    };
  }, []);

  // Persist open state and active session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOpen = localStorage.getItem('varuni_open');
      const savedSession = localStorage.getItem('varuni_session');
      if (savedOpen === '1') setIsVaruniOpen(true);
      if (savedSession) setSessionId(savedSession);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('varuni_open', isVaruniOpen ? '1' : '0');
      if (sessionId) localStorage.setItem('varuni_session', sessionId);
    }
  }, [isVaruniOpen, sessionId]);

  const loadRecentSessions = async () => {
    try {
      const res = await fetch('/api/varuni/sessions', {
        headers: { 'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '' }
      });
      const json = await res.json();
      if (json.success) setRecentSessions(json.sessions || []);
    } catch { }
  };

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    const el = chatLogRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  // Live tool/status streaming via SSE
  useEffect(() => {
    if (!sessionId) return;
    let es: EventSource | null = null;
    try {
      const url = new URL('/api/varuni/events', window.location.origin);
      url.searchParams.set('sessionId', sessionId);
      es = new EventSource(url.toString());
      es.onmessage = (evt) => {
        try {
          if (!evt?.data) return;
          const data = JSON.parse(evt.data);
          if (data?.type === 'ready') return;
          // Ignore events from earlier turns (if network delays cross with a new send)
          if (data?.turnId && (data.turnId !== (window as any).__varuni_turn_id__)) return;
          const activeTurn = streamingTurnRef.current;
          if (data?.type === 'tool_start' && data?.tool) setChatStatus(`Using ${data.tool}…`);
          if (data?.type === 'tool_end') setChatStatus('Thinking');
          if (data?.type === 'assistant_message') setChatStatus('Thinking...');
          if (data?.type === 'delta') {
            setChatMessages(prev => {
              const last = prev[prev.length - 1];
              const delta = String(data.delta || '');
              const next = prev.slice();
              // If last is a streaming bubble for current turn, merge; else start a new streaming bubble
              if (last && last.role === 'assistant' && (last as any).streaming === true) {
                const merged = (last.text || '') + delta;
                try {
                  const liveHtml = marked.parse(merged || '');
                  next[next.length - 1] = { role: 'assistant', text: merged, html: liveHtml as any, streaming: true } as any;
                } catch {
                  next[next.length - 1] = { role: 'assistant', text: merged, streaming: true } as any;
                }
                return next;
              } else {
                try {
                  const liveHtml = marked.parse(delta);
                  next.push({ role: 'assistant', text: delta, html: liveHtml as any, streaming: true } as any);
                } catch {
                  next.push({ role: 'assistant', text: delta, streaming: true } as any);
                }
                return next;
              }
            });
          }
          if (data?.type === 'final') {
            (window as any).__varuni_saw_final__ = true;
            streamingTurnRef.current = null;
            // Replace the last assistant bubble with the formatted HTML if available
            setChatMessages(prev => {
              const next = prev.slice();
              // remove trailing streaming bubble if exists
              if (next.length && next[next.length - 1].role === 'assistant') {
                next.pop();
              }
              if (typeof data.html === 'string' && data.html.trim().length > 0) {
                next.push({ role: 'assistant', html: data.html, text: data.message } as any);
              } else {
                try {
                  const finalHtml = marked.parse(String(data.message || ''));
                  next.push({ role: 'assistant', html: finalHtml as any, text: data.message } as any);
                } catch {
                  next.push({ role: 'assistant', text: data.message } as any);
                }
              }
              return next;
            });
            setChatStatus(null);
          }
        } catch { }
      };
      es.onerror = () => { try { es?.close(); } catch { }; es = null; (window as any).__varuni_sse_failed__ = true; setChatStatus(null); };
      ; (window as any).__varuni_turn_id__ = null;
    } catch { }
    return () => { try { es?.close(); } catch { } };
  }, [sessionId]);
  const minSearchChars = 2;
  const shouldFetch = debouncedQuery.length >= minSearchChars;
  const { data: searchData, loading: searchLoading, networkStatus } = useGlobalSearch(shouldFetch ? debouncedQuery : "", 8, { skip: !shouldFetch });
  const isRefetching = networkStatus === 4;
  const effectiveResults = shouldFetch ? (searchData?.globalSearch || []) : [];

  // Filter sidebar items based on user permissions (but always show disabled items)
  const visibleSidebarItems = sidebarItems
    .filter(item => item.disabled || (item.permission && permissions.hasPermission(item.permission as any)))
    .sort((a, b) => {
      // Always keep Settings last
      if (a.title === 'Settings') return 1;
      if (b.title === 'Settings') return -1;
      // Active (non-disabled) first
      const aActive = !a.disabled;
      const bActive = !b.disabled;
      if (aActive !== bActive) return aActive ? -1 : 1;
      // Otherwise keep original order
      return 0;
    });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      router.push("/login");
    }
  }, [router]);

  // Permission guard with redirect to first allowed route
  useEffect(() => {
    if (!user || permissions.loading) return;
    // Map pathname to required permission
    const requiresAccess = (path: string): boolean => {
      const p = path || "";
      if (p.startsWith("/dashboard/settings")) {
        return permissions.canAccessSettings();
      }
      const map: Array<{ test: (x: string) => boolean; perm: Parameters<typeof permissions.hasPermission>[0] }> = [
        { test: (x) => x === "/dashboard" || x === "/dashboard/", perm: "dashboard" },
        { test: (x) => x.startsWith("/dashboard/hostpro"), perm: "hostpro" },
        { test: (x) => x.startsWith("/dashboard/inventory"), perm: "inventory" },
        { test: (x) => x.startsWith("/dashboard/menu"), perm: "menu" },
        { test: (x) => x.startsWith("/dashboard/team"), perm: "team" },
        { test: (x) => x.startsWith("/dashboard/robotic-fleets"), perm: "robotic-fleets" },
        { test: (x) => x.startsWith("/dashboard/analytics"), perm: "analytics" },
        { test: (x) => x.startsWith("/dashboard/scheduling"), perm: "scheduling" },
        { test: (x) => x.startsWith("/dashboard/roster"), perm: "roster" },
      ];
      for (const m of map) {
        if (m.test(p)) return permissions.hasPermission(m.perm);
      }
      // default allow for unknown routes under dashboard
      return true;
    };

    if (!requiresAccess(pathname || "")) {
      // Debug: Log permission info
      console.log('Permission denied for path:', pathname);
      console.log('User role:', user?.role);
      console.log('User permissions:', user?.permissions);
      console.log('Available permissions for role:', user?.permissions || ROLE_PERMISSIONS[user?.role as Role] || []);

      // Compute first allowed landing route
      const order: Array<{ perm: Parameters<typeof permissions.hasPermission>[0]; route: string }> = [
        { perm: "dashboard", route: "/dashboard" },
        { perm: "hostpro", route: "/dashboard/hostpro" },
        { perm: "inventory", route: "/dashboard/inventory" },
        { perm: "menu", route: "/dashboard/menu" },
        { perm: "team", route: "/dashboard/team" },
        { perm: "robotic-fleets", route: "/dashboard/robotic-fleets" },
        { perm: "analytics", route: "/dashboard/analytics" },
        { perm: "scheduling", route: "/dashboard/scheduling" },
        { perm: "roster", route: "/dashboard/roster" },
      ];
      let landing = "/dashboard";
      for (const i of order) {
        if (permissions.hasPermission(i.perm)) { landing = i.route; break; }
      }
      if (!permissions.canAccessSettings() && landing === "/dashboard" && !permissions.hasPermission("dashboard")) {
        // Fallback to settings if that's the only allowed section
        landing = "/dashboard/settings";
      } else if (permissions.canAccessSettings() && !permissions.hasPermission("dashboard") && landing === "/dashboard") {
        landing = "/dashboard/settings";
      }
      try { sessionStorage.setItem("permissionDenied", "1"); } catch { }
      router.replace(landing);
    }
  }, [pathname, user, permissions, permissions.loading, router]);

  // Show permission denied modal if flagged by guard
  useEffect(() => {
    try {
      if (sessionStorage.getItem("permissionDenied") === "1") {
        sessionStorage.removeItem("permissionDenied");

        // Auto-fix common permission issues
        const userData = localStorage.getItem("user");
        if (userData) {
          try {
            const user = JSON.parse(userData);
            // If user is Staff role and doesn't have inventory permission, add it
            if (user.role === 'Staff' && (!user.permissions || !user.permissions.includes('inventory'))) {
              user.permissions = user.permissions || [];
              if (!user.permissions.includes('inventory')) {
                user.permissions.push('inventory');
                localStorage.setItem("user", JSON.stringify(user));
                console.log('Auto-fixed: Added inventory permission to Staff user');
                // Reload the page to apply the fix
                window.location.reload();
                return;
              }
            }
          } catch (e) {
            console.error('Error auto-fixing permissions:', e);
          }
        }

        setDeniedOpen(true);
      }
    } catch { }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b">
        <Image
          src="/l1logows.png"
          alt="ledger1"
          width={120}
          height={40}
          className="h-8 w-auto"
        />
        <div className="ml-4">
          <p className="text-xs text-muted-foreground">AI-Assisted Backoffice</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2">
        {visibleSidebarItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-between ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              onClick={() => !item.disabled && router.push(item.href)}
              disabled={item.disabled}
            >
              <span className="flex items-center">
                <item.icon className="mr-3 h-4 w-4" />
                <span className={isActive ? "dark:text-white text-foreground" : ""}>{item.title}</span>
              </span>
              {item.tag && (
                <Badge variant="secondary" className="ml-2">{item.tag}</Badge>
              )}
            </Button>
          );
        })}
      </nav>

      {/* Varuni AI Assistant */}
      <div className="p-4 border-t">
        <Button
          variant="outline"
          className="w-full justify-start border-primary/20 text-primary"
          onClick={() => setIsVaruniOpen(true)}
        >
          <Brain className="mr-3 h-4 w-4" />
          Chat with Varuni
        </Button>
      </div>
    </div>
  );

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <Dialog open={deniedOpen} onOpenChange={setDeniedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Restricted</DialogTitle>
            <DialogDescription>
              You don't have permission to view that page. We've taken you to a page you can access.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[18rem] lg:flex-col">
        <div className="flex flex-col flex-grow glass-pane border-r border-border/50 shadow-lg">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden fixed top-4 left-4 z-40">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 glass-pane border-r">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="lg:pl-[18rem] pt-16 min-h-screen bg-transparent">
        {/* Header */}
        <header className="fixed top-0 right-0 left-0 lg:left-[18rem] z-30 h-16 border-b border-border backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/80">
          <div className="px-4 sm:px-6 lg:px-8 h-full">
            <div className="flex items-center justify-between h-full">
              {/* Search */}
              <div className="flex-1 max-w-lg ml-12 lg:ml-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search anything..."
                    className="w-full pl-10 pr-4 py-2 border border-input bg-background/60 text-foreground rounded-lg focus:ring-2 focus:ring-ring focus:border-ring backdrop-blur-sm cursor-text"
                    onFocus={() => setIsSearchOpen(true)}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    value={searchQuery}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsSearchOpen(true);
                    }}
                  />
                </div>
                <CommandDialog open={isSearchOpen} onOpenChange={(v) => { setIsSearchOpen(v); if (!v) { setSearchQuery(""); setDebouncedQuery(""); } }}>
                  <CommandInput
                    placeholder="Search anything..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    autoFocus
                  />
                  <CommandList>
                    {isSearchOpen && searchQuery.trim().length < minSearchChars && (
                      <div className="py-3 px-3 text-sm text-muted-foreground">Type at least {minSearchChars} characters…</div>
                    )}
                    {isSearchOpen && searchQuery.trim().length >= minSearchChars && (isIdleTyping || searchLoading || isRefetching) && (
                      <div className="py-3 px-3 text-sm text-muted-foreground">Searching…</div>
                    )}
                    {isSearchOpen && searchQuery.trim().length >= minSearchChars && !searchLoading && effectiveResults.length === 0 && (
                      <CommandEmpty>No results found.</CommandEmpty>
                    )}
                    <CommandGroup heading="Results">
                      {effectiveResults.map((r: any) => (
                        <CommandItem
                          value={`${r.title} ${r.kind} ${r.description || ''}`}
                          key={`${r.kind}-${r.id}`}
                          onSelect={() => { setIsSearchOpen(false); setSearchQuery(""); router.push(r.route); }}
                        >
                          {r.title}
                          <span className="ml-2 text-xs text-muted-foreground">{r.kind}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </CommandDialog>
              </div>

              {/* Right side */}
              <div className="flex items-center space-x-4">
                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Notifications */}
                <Button variant="ghost" size="icon">
                  <Bell className="h-5 w-5" />
                </Button>

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center space-x-3 hover:bg-accent">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src="" alt={user.name} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left hidden sm:block">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.role}</p>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 bg-transparent min-h-screen p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Varuni AI Chat Overlay */}
      {isVaruniOpen && (
        <div className={`fixed ${isVaruniLarge ? 'inset-0 m-0 w-screen h-screen' : 'bottom-4 right-4 w-[28rem] h-[34rem]'} bg-card/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/50 rounded-lg shadow-xl border border-border z-50 flex flex-col max-w-[100vw] max-h-[100vh]`}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center">
              <Brain className="h-5 w-5 text-primary mr-2" />
              <h3 className="font-semibold text-card-foreground">Varuni Assistant</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" title="Voice Mode" onClick={() => setChatMode('voice')}>
                <Mic className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" title="Text Mode" onClick={() => setChatMode('text')}>
                <Keyboard className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" title="New chat" onClick={() => {
                setSessionId(null);
                setChatMessages([]);
                setTokenTotal(0);
                setContextTokens(0);
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('varuni_session');
                }
                setTimeout(() => chatInputRef.current?.focus(), 0);
              }}>
                <Plus className="h-4 w-4" />
              </Button>
              <DropdownMenu onOpenChange={(o) => { if (o) loadRecentSessions(); }}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" title="Recent chats">
                    <History className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-64 overflow-y-auto">
                  <DropdownMenuLabel>Recent Chats</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {recentSessions.length === 0 ? (
                    <DropdownMenuItem disabled>No history</DropdownMenuItem>
                  ) : (
                    recentSessions.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-2">
                        <button className="text-left flex-1 py-1" onClick={async () => {
                          try {
                            const res = await fetch('/api/varuni/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '' }, body: JSON.stringify({ sessionId: s.id }) });
                            const json = await res.json();
                            if (json.success) {
                              setSessionId(s.id);
                              setChatMessages((json.session?.messages || []).map((m: any) => ({ role: m.role, text: m.content, html: m.html })));
                              if (typeof json.session?.tokenTotal === 'number') setTokenTotal(json.session.tokenTotal);
                              if (typeof json.session?.contextTokens === 'number') setContextTokens(json.session.contextTokens);
                            }
                          } catch { }
                        }}>{s.title || 'Conversation'}</button>
                        <button className="text-xs text-destructive ml-2" onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await fetch('/api/varuni/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '' }, body: JSON.stringify({ sessionId: s.id }) });
                            await loadRecentSessions();
                          } catch { }
                        }}>Delete</button>
                      </div>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" title={isVaruniLarge ? 'Close full screen' : 'Full screen'} onClick={() => setIsVaruniLarge(v => !v)}>
                {isVaruniLarge ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsVaruniOpen(false)}>
                ×
              </Button>
            </div>
          </div>
          {chatMode === 'text' ? (
            <>
              <div className="p-4 flex-1 overflow-y-auto bg-gradient-to-b from-background/10 to-background/0">
                <div className="bg-primary/10 rounded-lg p-3 mb-3">
                  <p className="text-sm text-primary">
                    {(() => {
                      const name = (user?.name && user.name.split(' ')[0]) || (user?.email ? user.email.split('@')[0] : 'there');
                      const h = new Date().getHours();
                      const tod = h < 12 ? 'morning' : (h < 17 ? 'afternoon' : 'evening');
                      return `Good ${tod}, ${name}! Welcome to the LedgerOne Auto Shop Command Center. Ask me anything, or choose a suggestion below.`;
                    })()}
                  </p>
                </div>
                <div className="space-y-2 mb-3">
                  <Button variant="outline" size="sm" className="w-full text-left justify-start" onClick={() => {
                    const input = document.getElementById('varuni-chat-input') as HTMLInputElement | null;
                    if (input) { input.value = "Show me today's service performance"; input.focus(); }
                  }}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Show me today&apos;s service performance
                  </Button>
                  <Button variant="outline" size="sm" className="w-full text-left justify-start" onClick={() => {
                    const input = document.getElementById('varuni-chat-input') as HTMLInputElement | null;
                    if (input) { input.value = 'Check parts inventory levels and low stock'; input.focus(); }
                  }}>
                    <Package className="mr-2 h-4 w-4" /> Check parts inventory levels
                  </Button>
                  <Button variant="outline" size="sm" className="w-full text-left justify-start" onClick={() => {
                    const input = document.getElementById('varuni-chat-input') as HTMLInputElement | null;
                    if (input) { input.value = 'Help with technician scheduling for tomorrow'; input.focus(); }
                  }}>
                    <Users className="mr-2 h-4 w-4" /> Help with technician scheduling
                  </Button>
                </div>
                <div id="varuni-chat-log" ref={chatLogRef} className="space-y-2 overflow-x-hidden">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[85%]">
                        <div className={`text-[10px] mb-1 ${m.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                          {m.role === 'user' ? (user?.name?.split(' ')?.[0] || 'You') : 'Varuni'}
                        </div>
                        <div className={`${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'} rounded-2xl px-3 py-2 shadow-sm break-words`}>
                          {m.html ? (
                            <div className="text-sm leading-5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul:first-child]:mt-0 [&>ul:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ol:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: m.html }} />
                          ) : (
                            <div className="text-sm whitespace-pre-wrap break-words leading-5">{m.text}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatStatus && (
                    <div className="flex justify-start">
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const base = String(chatStatus || 'Thinking');
                          // Animated ellipsis: one-by-one appear/disappear
                          const dots = Math.floor((Date.now() / 500) % 6); // 0..5
                          const shown = dots <= 3 ? dots : 6 - dots; // 0..3..0
                          return base + '.'.repeat(shown);
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 border-t">
                <div className="flex space-x-2">
                  <input
                    id="varuni-chat-input"
                    ref={chatInputRef}
                    type="text"
                    placeholder="Ask Varuni anything..."
                    className="flex-1 px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring focus:border-ring"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        await sendMessage();
                      }
                    }}
                  />
                  <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={sendMessage}>
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>Tokens used this chat: {tokenTotal || 0}</span>
                  {(() => {
                    const max = 272000; // 272k
                    const baseTokens = (typeof contextTokens === 'number' && contextTokens > 0) ? contextTokens : (typeof tokenTotal === 'number' ? tokenTotal : 0);
                    const pctFloat = baseTokens > 0 ? Math.min(100, (baseTokens / max) * 100) : 0;
                    const r = 16;
                    const C = 2 * Math.PI * r;
                    const dash = baseTokens > 0 ? Math.max(0.75, Math.min(C, (pctFloat / 100) * C)) : 0;
                    const warn = pctFloat >= 90;
                    return (
                      <div className="flex items-center gap-2">
                        <div className="relative w-4 h-4">
                          <svg viewBox="0 0 36 36" className="w-4 h-4">
                            <path className="text-muted-foreground/30" strokeWidth="4" stroke="currentColor" fill="none" d="M18 2a16 16 0 1 1 0 32 16 16 0 0 1 0-32" />
                            <circle cx="18" cy="18" r="16" className={warn ? 'text-red-500' : 'text-primary'} strokeWidth="4" stroke="currentColor" fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} transform="rotate(-90 18 18)" />
                          </svg>
                        </div>
                        <span className={warn ? 'text-red-500' : ''}>Context: {pctFloat.toFixed(1)}%</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : (
            <VoiceChat />
          )}
        </div>
      )}
    </div>
  );
}

