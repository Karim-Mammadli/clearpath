"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX = 3 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Optional image field: choose a file, drag & drop, or paste (Ctrl/Cmd+V anywhere on the page).
 * The selected image is placed into a real <input type="file" name="image"> so it submits with the
 * form like a normal upload. The server re-validates size and type (magic bytes).
 */
export function ImageInput({ label = "Image creative (optional)", hint, compact = false }: { label?: string; hint?: string; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function setFile(file: File | null) {
    setError(null);
    const input = inputRef.current;
    if (!input) return;
    if (preview) URL.revokeObjectURL(preview.url);
    if (!file) {
      input.value = "";
      setPreview(null);
      return;
    }
    if (!TYPES.includes(file.type)) {
      setError("Use a PNG, JPEG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is 3MB.`);
      return;
    }
    const named = file.name && file.name !== "image.png" ? file : new File([file], `pasted-${Date.now()}.${file.type.split("/")[1]}`, { type: file.type });
    const dt = new DataTransfer();
    dt.items.add(named);
    input.files = dt.files;
    setPreview({ url: URL.createObjectURL(named), name: named.name, size: named.size });
  }

  // Paste an image anywhere on the page. Plain-text pastes into the textarea are left alone.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const hasText = !!e.clipboardData?.getData("text/plain");
      if (!hasText) e.preventDefault();
      setFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFile only touches refs/state setters
  }, [preview]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        setFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn("space-y-2 rounded-md border border-dashed p-3 transition-colors", dragging && "border-indigo-400 bg-indigo-50")}
    >
      {!compact && <div className="text-sm font-medium">{label}</div>}
      <p className="text-xs text-muted-foreground">
        {hint ?? "PNG, JPEG, GIF or WebP up to 3MB."} <span className="font-medium text-foreground">Paste (Ctrl/⌘+V), drag & drop, or choose a file.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          name="image"
          accept={TYPES.join(",")}
          className="sr-only"
          id="image-input"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <label htmlFor="image-input" className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 text-sm hover:bg-muted">
          <ImagePlus className="size-4" /> {preview ? "Replace image" : "Choose image"}
        </label>
        {preview && (
          <>
            <span className="text-xs text-muted-foreground">
              {preview.name} · {(preview.size / 1024).toFixed(0)} KB
            </span>
            <button type="button" onClick={() => setFile(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="size-3.5" /> Remove
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
      {preview && <img src={preview.url} alt="Selected image preview" className="max-h-48 rounded-md border object-contain" />}
    </div>
  );
}
