/**
 * Browser-side Cloudinary upload via unsigned upload preset.
 * Configure NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
 * in your .env.local — leave them blank to disable uploads (the form will surface a config error).
 */

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  resourceType: string;
  bytes: number;
}

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

export function uploadToCloudinary(
  file: File,
  options: {
    resourceType?: "image" | "video" | "auto";
    folder?: string;
    onProgress?: (pct: number) => void;
  } = {}
): Promise<CloudinaryUploadResult> {
  const cfg = getCloudinaryConfig();
  if (!cfg) {
    return Promise.reject(
      new Error(
        "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET."
      )
    );
  }

  const resourceType = options.resourceType ?? "auto";
  const url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cfg.uploadPreset);
  if (options.folder) formData.append("folder", options.folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({
            secureUrl: data.secure_url,
            publicId: data.public_id,
            width: data.width ?? 0,
            height: data.height ?? 0,
            format: data.format ?? "",
            resourceType: data.resource_type ?? resourceType,
            bytes: data.bytes ?? 0,
          });
        } catch {
          reject(new Error("Cloudinary returned an invalid response"));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error?.message) message = data.error.message;
        } catch {}
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(formData);
  });
}
