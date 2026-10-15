"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX = 5 * 1024 * 1024; // what the user may pick/paste
const UPLOAD_TARGET = 3.5 * 1024 * 1024; // what we send (Vercel caps request bodies at 4.5MB)
const MAX_SIDE = 2400; // plenty for the model to read fine print
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Downscales/re-encodes large images in the browser so the upload fits under the platform body limit. */
async function shrinkIfNeeded(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const [type, quality] of [["image/webp", 0.9], ["image/webp", 0.8], ["image/jpeg", 0.8], ["image/jpeg", 0.65]] as const) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    if (blob && blob.size <= UPLOAD_TARGET && (blob.type === type)) {
      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "image";
      return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
    }
  }
  throw new Error("Couldn't compress this image under the upload limit. Try a smaller image.");
}

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

  async function setFile(file: File | null) {
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
      input.value = "";
      setError("Use a PNG, JPEG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX) {
      input.value = "";
      setPreview(null);
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is 5MB.`);
      return;
    }
    let ready: File;
    try {
      ready = await shrinkIfNeeded(file);
    } catch (e) {
      input.value = "";
      setPreview(null);
      setError((e as Error).message);
      return;
    }
    const named = ready.name && ready.name !== "image.png" ? ready : new File([ready], `pasted-${Date.now()}.${ready.type.split("/")[1]}`, { type: ready.type });
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
        {hint ?? "PNG, JPEG, GIF or WebP up to 5MB."} <span className="font-medium text-foreground">Paste (Ctrl/⌘+V), drag & drop, or choose a file.</span>
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
