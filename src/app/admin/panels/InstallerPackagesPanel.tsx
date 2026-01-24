"use client";

import React from "react";

/**
 * Container info from the API
 */
interface ContainerInfo {
  id: string;
  name: string;
  brandKey: string;
  type: "containerapps" | "appservice" | "registry";
  image?: string;
  tag?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  hasSignedApk?: boolean;
  hasPackage?: boolean;
  packageUrl?: string;
  endpoint?: string;
  hasPartner?: boolean;
  partnerInfo?: {
    brandKey: string;
    name?: string;
    appUrl?: string;
  };
}

interface RegistryImage {
  repository: string;
  tags: string[];
  latestTag?: string;
  latestDigest?: string;
  updatedAt?: string;
}

interface PartnerBrand {
  brandKey: string;
  name?: string;
  appUrl?: string;
  hasWebapp?: boolean;
}

/**
 * Installer Packages Panel
 *
 * Purpose:
 * - List deployed containers from Azure (App Service / Container Apps)
 * - Show APK and package availability status
 * - Allow generating packages on demand with custom endpoint URLs
 * - Present installer ZIP downloads with dynamic buttons
 * 
 * Note: Each partner brand gets their OWN APK with their custom endpoint URL embedded.
 * The base PortalPay APK is used as a template, and wrap.html is modified to point
 * to the partner's URL (e.g., xoinpay.azurewebsites.net instead of pay.ledger1.ai).
 */
export default function InstallerPackagesPanel() {
  const [containerType, setContainerType] = React.useState<string>("platform");
  const [brandEnv, setBrandEnv] = React.useState<string>("");
  const [containers, setContainers] = React.useState<ContainerInfo[]>([]);
  const [registryImages, setRegistryImages] = React.useState<RegistryImage[]>([]);
  const [partners, setPartners] = React.useState<PartnerBrand[]>([]);
  const [unmatchedPartners, setUnmatchedPartners] = React.useState<PartnerBrand[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [generatingPackage, setGeneratingPackage] = React.useState<string | null>(null);
  const [generatingTouchpoint, setGeneratingTouchpoint] = React.useState<string | null>(null);
  const [touchpointPackages, setTouchpointPackages] = React.useState<Record<string, string>>({});  // brandKey -> sasUrl
  const [appInstallTotals, setAppInstallTotals] = React.useState<Record<string, number>>({});
  const [jobProgress, setJobProgress] = React.useState<string | null>(null);  // Current job progress message

  // Fetch container type and brand
  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/site/container", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j && typeof j.containerType === "string") {
          setContainerType(String(j.containerType).toLowerCase());
        }
        if (j && typeof j.brandKey === "string") {
          setBrandEnv(String(j.brandKey).toLowerCase());
        }
      } catch { }
    })();
  }, []);

  // Fetch containers from API
  const fetchContainers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/devices/containers", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setContainers(data?.containers || []);
      setRegistryImages(data?.registryImages || []);
      setPartners(data?.partners || []);
      setUnmatchedPartners(data?.unmatchedPartners || []);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch containers");
      // Fallback: show static options for portalpay/paynex
      setContainers([]);
      setPartners([]);
      setUnmatchedPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  // Fetch app install totals
  React.useEffect(() => {
    (async () => {
      if (!brandEnv) return;
      try {
        const brands = containerType === "partner"
          ? [brandEnv]
          : Array.from(new Set([...containers.map(c => c.brandKey), "portalpay", "paynex"]));

        const totals: Record<string, number> = {};
        for (const brand of brands) {
          if (!brand) continue;
          const res = await fetch(
            `/api/app/installs?app=${brand}&brandKey=${encodeURIComponent(brand)}&limit=1`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            totals[brand] = Number(data?.total || 0);
          }
        }
        setAppInstallTotals(totals);
      } catch { }
    })();
  }, [containerType, brandEnv, containers]);

  // Generate package for a brand with optional custom endpoint (uses SSE for progress)
  const handleGeneratePackage = async (brandKey: string, endpoint?: string) => {
    setGeneratingPackage(brandKey);
    setJobProgress("Starting...");

    try {
      // Start SSE stream request
      const res = await fetch("/api/admin/devices/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKey, endpoint: endpoint || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to start package generation: ${data?.message || data?.error || "Unknown error"}`);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        alert("Failed to read response stream");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE messages (format: "data: {...}\n\n")
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep incomplete message in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // Update progress display
              if (data.progress) {
                setJobProgress(data.progress);
              }

              if (data.status === "completed") {
                setJobProgress(null);
                await fetchContainers();
                if (data.sasUrl) {
                  window.open(data.sasUrl, "_blank");
                }
                return;
              } else if (data.status === "failed") {
                setJobProgress(null);
                alert(`Package generation failed: ${data.progress || data.error || "Unknown error"}`);
                return;
              }
            } catch (e) {
              console.error("Failed to parse SSE message:", line, e);
            }
          }
        }
      }

      // Stream ended without completion message
      setJobProgress(null);
      alert("Stream ended unexpectedly. Check server logs.");
    } catch (e: any) {
      setJobProgress(null);
      alert(`Error: ${e?.message || "Failed to generate package"}`);
    } finally {
      setGeneratingPackage(null);
    }
  };

  // Generate Touchpoint APK for a brand (uses SSE for real-time progress)
  const handleGenerateTouchpoint = async (brandKey: string, baseEndpoint?: string) => {
    setGeneratingTouchpoint(brandKey);
    setJobProgress("Starting...");

    try {
      // Build touchpoint endpoint: base URL + /touchpoint?scale=0.75
      let touchpointEndpoint = baseEndpoint || `https://${brandKey}.azurewebsites.net`;
      touchpointEndpoint = touchpointEndpoint.replace(/\/$/, "");
      touchpointEndpoint = `${touchpointEndpoint}/touchpoint?scale=0.75`;

      // Start SSE stream request
      const res = await fetch("/api/admin/devices/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKey, endpoint: touchpointEndpoint }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to start Touchpoint generation: ${data?.message || data?.error || "Unknown error"}`);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        alert("Failed to read response stream");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE messages
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.progress) {
                setJobProgress(data.progress);
              }

              if (data.status === "completed") {
                setJobProgress(null);
                await fetchContainers();
                if (data.sasUrl || data.downloadUrl) {
                  setTouchpointPackages(prev => ({ ...prev, [brandKey]: data.sasUrl || data.downloadUrl }));
                  window.open(data.sasUrl || data.downloadUrl, "_blank");
                }
                return;
              } else if (data.status === "failed") {
                setJobProgress(null);
                alert(`Touchpoint generation failed: ${data.progress || data.error || "Unknown error"}`);
                return;
              }
            } catch (e) {
              console.error("Failed to parse SSE message:", line, e);
            }
          }
        }
      }

      setJobProgress(null);
      alert("Stream ended unexpectedly. Check server logs.");
    } catch (e: any) {
      setJobProgress(null);
      alert(`Error: ${e?.message || "Failed to generate Touchpoint package"}`);
    } finally {
      setGeneratingTouchpoint(null);
    }
  };

  // Format date for display
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const targetApp: "portalpay" | "paynex" = brandEnv === "paynex" ? "paynex" : "portalpay";

  return (
    <div className="space-y-4">
      {/* Info about APK generation */}
      <div className="rounded-md border p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <div className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Note:</strong> Each partner brand gets their own APK with their custom endpoint URL embedded.
          When generating a package, specify the partner&apos;s URL (e.g., xoinpay.azurewebsites.net) and the APK
          will be modified to load that site instead of the default.
        </div>
      </div>
    </div>
  );
}

/**
 * Mini form to generate a package for any brand
 */
function GeneratePackageForm({
  onGenerate,
  generating
}: {
  onGenerate: (brandKey: string, endpoint?: string) => void;
  generating: string | null;
}) {
  const [brandKey, setBrandKey] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [showEndpoint, setShowEndpoint] = React.useState(false);

  // Auto-suggest endpoint when brand key changes
  React.useEffect(() => {
    const key = brandKey.trim().toLowerCase();
    if (key && !endpoint) {
      // Suggest endpoint based on brand key
      if (key === "portalpay") {
        setEndpoint("https://pay.ledger1.ai");
      } else if (key === "paynex") {
        setEndpoint("https://paynex.azurewebsites.net");
      } else {
        // Default pattern for other brands
        setEndpoint(`https://${key}.azurewebsites.net`);
      }
    }
  }, [brandKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = brandKey.trim().toLowerCase();
    if (key) {
      onGenerate(key, endpoint.trim() || undefined);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={brandKey}
          onChange={(e) => setBrandKey(e.target.value)}
          placeholder="Brand key (e.g., xoinpay)"
          className="flex-1 px-3 py-1.5 rounded-md border text-sm bg-background"
          disabled={!!generating}
        />
        <button
          type="button"
          onClick={() => setShowEndpoint(!showEndpoint)}
          className="px-2 py-1.5 rounded-md border text-xs hover:bg-foreground/10"
          title="Configure custom endpoint URL"
        >
          {showEndpoint ? "▲ Hide Endpoint" : "▼ Custom Endpoint"}
        </button>
      </div>

      {/* Endpoint input (optional) */}
      {showEndpoint && (
        <div className="space-y-1">
          <label className="microtext text-muted-foreground">
            APK Endpoint URL (the URL loaded in the app wrapper)
          </label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://xoinpay.azurewebsites.net"
            className="w-full px-3 py-1.5 rounded-md border text-sm bg-background font-mono"
            disabled={!!generating}
          />
          <div className="microtext text-muted-foreground">
            Default: For portalpay → pay.ledger1.ai, others → {"{brand}"}.azurewebsites.net
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!brandKey.trim() || !!generating}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-foreground/10 disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Package (.zip)"}
        </button>
        {endpoint && showEndpoint && (
          <span className="microtext text-muted-foreground">
            → {endpoint}
          </span>
        )}
      </div>
    </form>
  );
}
