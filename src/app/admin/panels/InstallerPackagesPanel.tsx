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
  const [appInstallTotals, setAppInstallTotals] = React.useState<Record<string, number>>({});

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

  // Generate package for a brand with optional custom endpoint
  const handleGeneratePackage = async (brandKey: string, endpoint?: string) => {
    setGeneratingPackage(brandKey);
    try {
      const res = await fetch("/api/admin/devices/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKey, endpoint: endpoint || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Failed to generate package: ${data?.message || data?.error || "Unknown error"}`);
        return;
      }
      // Show info about APK source
      if (data?.apkSource?.includes("base APK")) {
        console.log(`Package generated using ${data.apkSource}`);
      }
      // Refresh containers to update state
      await fetchContainers();
      // Open download link if available
      if (data?.sasUrl) {
        window.open(data.sasUrl, "_blank");
      }
    } catch (e: any) {
      alert(`Error: ${e?.message || "Failed to generate package"}`);
    } finally {
      setGeneratingPackage(null);
    }
  };

  // Generate Touchpoint APK for a brand (uses same process as Partner but with /touchpoint?scale=0.75 endpoint)
  const handleGenerateTouchpoint = async (brandKey: string, baseEndpoint?: string) => {
    setGeneratingTouchpoint(brandKey);
    try {
      // Build touchpoint endpoint: base URL + /touchpoint?scale=0.75
      let touchpointEndpoint = baseEndpoint || `https://${brandKey}.azurewebsites.net`;
      // Remove trailing slash if present
      touchpointEndpoint = touchpointEndpoint.replace(/\/$/, "");
      // Append touchpoint path
      touchpointEndpoint = `${touchpointEndpoint}/touchpoint?scale=0.75`;

      const res = await fetch("/api/admin/devices/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKey: `${brandKey}-touchpoint`, endpoint: touchpointEndpoint }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Failed to generate Touchpoint package: ${data?.message || data?.error || "Unknown error"}`);
        return;
      }
      // Refresh containers to update state
      await fetchContainers();
      // Open download link if available
      if (data?.sasUrl) {
        window.open(data.sasUrl, "_blank");
      }
      alert(`Touchpoint APK generated for ${brandKey}!\nEndpoint: ${touchpointEndpoint}`);
    } catch (e: any) {
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

      {/* Loading state */}
      {loading && (
        <div className="rounded-md border p-4 bg-foreground/5 animate-pulse">
          <div className="h-4 bg-foreground/10 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-foreground/10 rounded w-1/2"></div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-amber-500/30 p-3 bg-amber-50 dark:bg-amber-950/20">
          <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Could not fetch deployed containers
          </div>
          <div className="microtext text-amber-600 dark:text-amber-500 mt-1">
            {error}
          </div>
          <div className="microtext text-muted-foreground mt-2">
            Showing static installer packages instead. Azure credentials may not be configured.
          </div>
        </div>
      )}

      {/* Deployed Containers */}
      {!loading && containers.length > 0 && (
        <div className="rounded-md border p-4 bg-foreground/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Deployed Containers</div>
            <button
              onClick={() => fetchContainers()}
              className="text-xs px-2 py-1 rounded border hover:bg-foreground/5"
              title="Refresh container list"
            >
              Refresh
            </button>
          </div>

          <div className="divide-y divide-foreground/10">
            {containers.map((container) => (
              <div key={container.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{container.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${container.status === "Running" || container.status === "Succeeded"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                        {container.status || "unknown"}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {container.type}
                      </span>
                      {container.hasPartner ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" title="Has matching partner in database">
                          ✓ Partner
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="No matching partner in database">
                          No Partner
                        </span>
                      )}
                    </div>
                    <div className="microtext text-muted-foreground mt-1">
                      Brand: <span className="font-mono">{container.brandKey || "—"}</span>
                      {container.tag && <> · Tag: <span className="font-mono">{container.tag}</span></>}
                      {container.partnerInfo?.name && <> · Partner: {container.partnerInfo.name}</>}
                    </div>
                    <div className="microtext text-muted-foreground">
                      Updated: {formatDate(container.updatedAt)}
                    </div>
                    {container.url && (
                      <a
                        href={container.url}
                        target="_blank"
                        rel="noreferrer"
                        className="microtext text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {container.url}
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {/* Status indicators */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className={container.hasPackage ? "text-emerald-600" : "text-amber-600"}>
                        Package: {container.hasPackage ? "✓" : "✗"}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {container.hasPackage && container.packageUrl ? (
                        <a
                          href={container.packageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded border text-xs hover:bg-foreground/5"
                          title="Download installer package"
                        >
                          Download ZIP
                        </a>
                      ) : (
                        <>
                          <button
                            onClick={() => handleGeneratePackage(container.brandKey)}
                            disabled={generatingPackage === container.brandKey}
                            className="px-2 py-1 rounded border text-xs hover:bg-foreground/5 disabled:opacity-50"
                            title="Generate installer package (uses base PortalPay APK)"
                          >
                            {generatingPackage === container.brandKey ? "Generating..." : "Generate Package"}
                          </button>
                          <button
                            onClick={() => handleGenerateTouchpoint(container.brandKey, container.url)}
                            disabled={generatingTouchpoint === container.brandKey}
                            className="px-2 py-1 rounded border text-xs hover:bg-emerald-500/20 border-emerald-500/50 disabled:opacity-50"
                            title="Generate Touchpoint APK (uses /touchpoint?scale=0.75 endpoint)"
                          >
                            {generatingTouchpoint === container.brandKey ? "Generating..." : "Touchpoint APK"}
                          </button>
                        </>
                      )}

                      {container.brandKey && (
                        <span className="microtext text-muted-foreground">
                          Installs: {appInstallTotals[container.brandKey] ?? 0}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Installer Packages - shows available brands based on role */}
      <div className="rounded-md border p-4 bg-foreground/5 space-y-3">
        <div className="text-sm font-medium">Installer Packages</div>

        {containerType === "partner" ? (
          /* Partners only see their own brand button */
          <div className="flex items-center gap-3">
            <a
              className="px-3 py-1.5 rounded-md border text-sm hover:bg-foreground/10"
              href={`/api/admin/apk/zips/${brandEnv || targetApp}`}
              target="_blank"
              rel="noreferrer"
              title={`Download ${brandEnv || targetApp} installer ZIP`}
            >
              Download {(brandEnv || targetApp).charAt(0).toUpperCase() + (brandEnv || targetApp).slice(1)} ZIP
            </a>
            <span className="microtext text-muted-foreground">
              App Installs: {appInstallTotals[brandEnv || targetApp] ?? 0}
            </span>
          </div>
        ) : (
          /* Platform admin sees ALL brands dynamically from containers OR partners */
          <div className="flex flex-col gap-3">
            {(() => {
              // Collect all brands from containers AND partners (fully dynamic)
              const brandSet = new Set<string>();

              // Add brands from deployed containers
              containers.forEach(c => {
                if (c.brandKey) {
                  brandSet.add(c.brandKey);
                }
              });

              // Also add brands from partners (fallback when Azure ARM API not available)
              partners.forEach(p => {
                if (p.brandKey) {
                  brandSet.add(p.brandKey);
                }
              });

              // Sort alphabetically
              const brands = Array.from(brandSet).sort((a, b) => a.localeCompare(b));

              if (brands.length === 0 && !loading) {
                return (
                  <div className="microtext text-muted-foreground">
                    No brands detected. Add partners to see installer packages here.
                  </div>
                );
              }

              if (brands.length === 0) {
                return null; // Still loading
              }

              return brands.map(brand => {
                const displayName = brand.charAt(0).toUpperCase() + brand.slice(1);
                const container = containers.find(c => c.brandKey === brand);
                const partner = partners.find(p => p.brandKey === brand);
                const hasPackage = container?.hasPackage;
                const hasSignedApk = container?.hasSignedApk;
                const hasWebapp = container || partner?.hasWebapp;

                return (
                  <div key={brand} className="flex items-center gap-3">
                    <a
                      className="px-3 py-1.5 rounded-md border text-sm hover:bg-foreground/10"
                      href={`/api/admin/apk/zips/${brand}`}
                      target="_blank"
                      rel="noreferrer"
                      title={`Download ${displayName} installer ZIP`}
                    >
                      Download {displayName} ZIP
                    </a>
                    <span className="microtext text-muted-foreground">
                      App Installs: {appInstallTotals[brand] ?? 0}
                    </span>
                    {!hasWebapp && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        No webapp
                      </span>
                    )}
                    {hasWebapp && !hasPackage && !hasSignedApk && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        May need generation
                      </span>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Unmatched Partners (partners without webapps) */}
      {!loading && unmatchedPartners.length > 0 && (
        <div className="rounded-md border p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Partners Without Webapps ({unmatchedPartners.length})
            </div>
          </div>
          <div className="microtext text-amber-600 dark:text-amber-500">
            These partners are registered in the database but don&apos;t have a matching Azure webapp.
            The webapp name should match the brandKey.
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-800">
            {unmatchedPartners.map((partner) => (
              <div key={partner.brandKey} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm">{partner.brandKey}</span>
                  {partner.name && <span className="text-muted-foreground ml-2">({partner.name})</span>}
                </div>
                <button
                  onClick={() => handleGeneratePackage(partner.brandKey, partner.appUrl)}
                  disabled={generatingPackage === partner.brandKey}
                  className="px-2 py-1 rounded border text-xs hover:bg-foreground/5 disabled:opacity-50"
                  title={`Generate installer package for ${partner.brandKey}`}
                >
                  {generatingPackage === partner.brandKey ? "Generating..." : "Generate Package"}
                </button>
                <button
                  onClick={() => handleGenerateTouchpoint(partner.brandKey, partner.appUrl)}
                  disabled={generatingTouchpoint === partner.brandKey}
                  className="px-2 py-1 rounded border text-xs hover:bg-emerald-500/20 border-emerald-500/50 disabled:opacity-50"
                  title={`Generate Touchpoint APK for ${partner.brandKey}`}
                >
                  {generatingTouchpoint === partner.brandKey ? "Generating..." : "Touchpoint APK"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partner Summary */}
      {!loading && partners.length > 0 && (
        <details className="rounded-md border p-4 bg-foreground/5">
          <summary className="text-sm font-medium cursor-pointer">
            All Partners ({partners.length}) — {partners.filter(p => p.hasWebapp).length} with webapps
          </summary>
          <div className="mt-3 space-y-2">
            {partners.map((partner) => (
              <div key={partner.brandKey} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${partner.hasWebapp ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="font-mono">{partner.brandKey}</span>
                  {partner.name && <span className="text-muted-foreground">({partner.name})</span>}
                </div>
                <span className="text-muted-foreground">
                  {partner.hasWebapp ? "✓ Webapp exists" : "No webapp"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Registry Images (optional section) */}
      {!loading && registryImages.length > 0 && (
        <details className="rounded-md border p-4 bg-foreground/5">
          <summary className="text-sm font-medium cursor-pointer">
            Container Registry Images ({registryImages.length})
          </summary>
          <div className="mt-3 space-y-2">
            {registryImages.map((img) => (
              <div key={img.repository} className="text-xs">
                <div className="font-mono">{img.repository}</div>
                <div className="microtext text-muted-foreground">
                  Latest: {img.latestTag || "—"} · Updated: {formatDate(img.updatedAt)}
                </div>
                {img.tags.length > 0 && (
                  <div className="microtext text-muted-foreground">
                    Tags: {img.tags.slice(0, 5).join(", ")}{img.tags.length > 5 ? ` (+${img.tags.length - 5} more)` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Instructions */}
      <div className="rounded-md border p-4 bg-foreground/5 microtext">
        <div className="text-sm font-semibold mb-2">Instructions</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Download the installer ZIP for your brand.</li>
          <li>Unzip on Windows or macOS. Ensure Android Platform Tools (adb) are installed and in PATH.</li>
          <li>Connect the device via USB with Developer Options → USB debugging enabled.</li>
          <li>
            <strong>Windows:</strong> Run <code className="px-1 py-0.5 bg-foreground/10 rounded">install_{targetApp}.bat</code>
          </li>
          <li>
            <strong>macOS/Linux:</strong> Run <code className="px-1 py-0.5 bg-foreground/10 rounded">chmod +x install_{targetApp}.sh && ./install_{targetApp}.sh</code>
          </li>
          <li>Launch the app with network connectivity; first run will register the install for your brand.</li>
        </ul>
      </div>

      {/* Generate Package Form for Platform Admin */}
      {containerType === "platform" && (
        <div className="rounded-md border p-4 bg-foreground/5 space-y-3">
          <div className="text-sm font-medium">Generate Package for Brand</div>
          <div className="microtext text-muted-foreground">
            Generate an installer package (.zip) for any brand. Each brand gets their own APK with their endpoint URL embedded.
          </div>
          <GeneratePackageForm
            onGenerate={handleGeneratePackage}
            generating={generatingPackage}
          />
        </div>
      )}
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
