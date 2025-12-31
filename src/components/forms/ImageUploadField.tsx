"use client";

import React from "react";

export type ImageUploadFieldProps = {
  label?: string;
  value?: string | string[];
  onChange: (next: string | string[]) => void;
  multiple?: boolean;
  // A short identifier forwarded to /api/public/images (helps categorize uploads in storage)
  target?: string;
  // Placeholder for URL input
  urlPlaceholder?: string;
  // Guidance text (e.g., recommended dimensions/format)
  guidance?: string;
  // Max number of images allowed when multiple
  max?: number;
  // Size hints for previews (in pixels)
  previewSize?: number;
  className?: string;
  compact?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
};

/**
 * ImageUploadField
 * - Beautiful, mobile-responsive drag-and-drop upload with clear guidance
 * - Works for single or multiple images
 * - Supports file picker and paste-URL
 * - Live previews with Clear/Remove
 * - Uploads to /api/public/images and returns persisted public URLs
 */
export default function ImageUploadField(props: ImageUploadFieldProps) {
  const {
    label,
    value,
    onChange,
    multiple = false,
    target = "generic_image",
    urlPlaceholder = "…or paste an image URL",
    guidance = "PNG/WebP recommended; each ≤10 MB",
    max = 10,
    previewSize = 112,
    className = "",
    compact = false,
    onUploadStart,
    onUploadEnd,
  } = props;

  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const fileId = React.useMemo(() => `image-upload-${Math.random().toString(36).slice(2)}`, []);

  const values: string[] = Array.isArray(value) ? value : (value ? [value] : []);

  async function uploadPublicImages(files: File[]): Promise<string[]> {
    setError("");
    setUploading(true);
    if (onUploadStart) onUploadStart();
    try {
      if (!files || files.length === 0) return [];
      const form = new FormData();
      form.append("target", target);
      // Endpoint limits to 3 inputs per request; chunk if needed
      const chunk = files.slice(0, 3);
      for (const f of chunk) form.append("file", f);
      const r = await fetch("/api/public/images", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok || !Array.isArray(j?.images)) {
        throw new Error(j?.error || "upload_failed");
      }
      return j.images.map((img: any) => String(img?.url || "")).filter(Boolean);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      return [];
    } finally {
      setUploading(false);
      if (onUploadEnd) onUploadEnd();
    }
  }

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const urls = await uploadPublicImages(files);
    if (!urls.length) return;
    if (multiple) {
      const merged = Array.from(new Set([...(values || []), ...urls])).slice(0, max);
      onChange(merged);
    } else {
      onChange(urls[0]);
    }
    e.target.value = "";
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f && f.type && f.type.startsWith("image/"));
    if (!files.length) return;
    const urls = await uploadPublicImages(files);
    if (!urls.length) return;
    if (multiple) {
      const merged = Array.from(new Set([...(values || []), ...urls])).slice(0, max);
      onChange(merged);
    } else {
      onChange(urls[0]);
    }
  }

  function handleUrlPaste(e: React.ChangeEvent<HTMLInputElement>) {
    const u = String(e.target.value || "").trim();
    if (!u) return;
    if (multiple) {
      const merged = Array.from(new Set([...(values || []), u])).slice(0, max);
      onChange(merged);
    } else {
      onChange(u);
    }
    e.target.value = "";
  }

  function clearSingle() { onChange(""); }
  function removeAt(idx: number) {
    const next = (values || []).filter((_, i) => i !== idx);
    onChange(next);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="microtext">{label}</label>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-md border-2 border-dashed p-4 text-center transition ${dragging ? 'border-primary bg-primary/5' : 'border-muted'} bg-background`}
      >
        <div className="microtext text-muted-foreground">Drag & drop image{multiple ? 's' : ''} here, or</div>
        <div className="mt-2 inline-flex items-center gap-2 flex-wrap justify-center">
          <input id={fileId} type="file" accept="image/*" multiple={multiple} onChange={handleSelect} className="hidden" />
          <button type="button" className="px-3 py-1.5 rounded-md border text-sm" onClick={() => { const el = document.getElementById(fileId) as HTMLInputElement | null; el?.click(); }}>Select image{multiple ? 's' : ''}</button>
          {!multiple && (
            <button type="button" className="px-3 py-1.5 rounded-md border text-sm" onClick={clearSingle} disabled={!values.length}>Clear</button>
          )}
          {uploading && <span className="microtext text-muted-foreground">Uploading…</span>}
        </div>
        <div className="mt-2">
          <input className="h-9 w-full max-w-md mx-auto px-3 border rounded-md bg-background" placeholder={urlPlaceholder} onChange={handleUrlPaste} />
        </div>
        <div className="mt-2 microtext text-muted-foreground">{guidance}</div>
        {error && <div className="microtext text-red-600 mt-1">{error}</div>}
      </div>

      {/* Previews */}
      {!multiple ? (
        values[0] ? (
          <div className="mt-2 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={values[0]} alt="preview" className="rounded-md border" style={{ width: previewSize, height: previewSize, objectFit: "contain" }} />
          </div>
        ) : null
      ) : (
        values.length ? (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {values.map((u, idx) => (
              <div key={`${u}-${idx}`} className="rounded-md border overflow-hidden relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`image ${idx + 1}`} className="w-full" style={{ height: previewSize, objectFit: "cover" }} />
                <button type="button" className="absolute top-1 right-1 px-2 py-0.5 rounded-md border text-xs bg-background/80 hover:bg-background transition opacity-0 group-hover:opacity-100" onClick={() => removeAt(idx)}>Remove</button>
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
