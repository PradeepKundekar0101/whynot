"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import Image from "next/image";
import { X, ImageIcon, Video as VideoIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadToCloudinary, getCloudinaryConfig } from "@/lib/cloudinary";

interface MediaUploadTileProps {
  label: string;
  description: string;
  acceptTypes: string[];
  maxBytes: number;
  resourceType: "image" | "video";
  value: string;
  required?: boolean;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}

function bytesToMb(b: number) {
  return (b / (1024 * 1024)).toFixed(1);
}

function MediaUploadTile({
  label,
  description,
  acceptTypes,
  maxBytes,
  resourceType,
  value,
  required,
  onUploaded,
  onCleared,
}: MediaUploadTileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!acceptTypes.some((t) => file.type === t || file.type.startsWith(t.replace("/*", "")))) {
      setError(`Invalid file type. Accepted: ${acceptTypes.join(", ")}`);
      return;
    }
    if (file.size > maxBytes) {
      setError(`File too large. Max ${bytesToMb(maxBytes)} MB.`);
      return;
    }
    setProgress(0);
    try {
      const result = await uploadToCloudinary(file, {
        resourceType,
        folder: "shows",
        onProgress: (p) => setProgress(p),
      });
      onUploaded(result.secureUrl);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  };

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const Icon = resourceType === "image" ? ImageIcon : VideoIcon;

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </p>
        {value && (
          <button
            type="button"
            onClick={onCleared}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-border aspect-square bg-secondary">
          {resourceType === "image" ? (
            <Image
              src={value}
              alt={label}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 320px"
            />
          ) : (
            <video src={value} controls className="w-full h-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs font-semibold py-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Replace
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center text-center aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-foreground/30 hover:bg-secondary/50"
          )}
        >
          {progress !== null ? (
            <div className="w-full max-w-[180px]">
              <p className="text-xs text-muted-foreground mb-2">Uploading… {progress}%</p>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Icon className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium mb-1">
                <span className="text-primary underline decoration-primary/40 underline-offset-4">
                  Click to upload
                </span>{" "}
                or drag and drop
              </p>
              <p className="text-xs text-muted-foreground leading-snug">{description}</p>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-destructive flex items-start gap-1">
          <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes.join(",")}
        className="hidden"
        onChange={handleSelect}
      />
    </div>
  );
}

interface MediaUploaderProps {
  thumbnailUrl: string;
  videoPreviewUrl: string;
  onChange: (next: { thumbnailUrl?: string; videoPreviewUrl?: string }) => void;
}

export function MediaUploader({
  thumbnailUrl,
  videoPreviewUrl,
  onChange,
}: MediaUploaderProps) {
  const cloudinaryConfigured = !!getCloudinaryConfig();

  return (
    <div className="flex flex-col gap-4">
      {!cloudinaryConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-px shrink-0" />
          <div>
            <p className="font-semibold">Cloudinary is not configured.</p>
            <p>
              Set <code>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code> and{" "}
              <code>NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</code> in <code>client/.env</code> to
              enable uploads.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-4">
        <MediaUploadTile
          label="Thumbnail"
          description="Recommended 1080×1080. JPG or PNG, up to 5 MB."
          acceptTypes={["image/jpeg", "image/png", "image/webp"]}
          maxBytes={5 * 1024 * 1024}
          resourceType="image"
          required
          value={thumbnailUrl}
          onUploaded={(url) => onChange({ thumbnailUrl: url })}
          onCleared={() => onChange({ thumbnailUrl: "" })}
        />
        <MediaUploadTile
          label="Video Preview"
          description="Optional. MP4, up to 30 seconds, max 50 MB."
          acceptTypes={["video/mp4", "video/quicktime"]}
          maxBytes={50 * 1024 * 1024}
          resourceType="video"
          value={videoPreviewUrl}
          onUploaded={(url) => onChange({ videoPreviewUrl: url })}
          onCleared={() => onChange({ videoPreviewUrl: "" })}
        />
      </div>
    </div>
  );
}
