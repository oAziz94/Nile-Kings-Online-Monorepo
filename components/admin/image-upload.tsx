"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, ImageIcon } from "lucide-react";

type ImageUploadProps = {
  value: string | null;
  onChange: (url: string) => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Admin image upload: file input → POST /api/admin/upload (base64) → sets URL via onChange.
 * Shows current image thumbnail and an "Upload" button. Works when Cloudinary is configured.
 */
export function ImageUpload({
  value,
  onChange,
  label = "صورة المنتج",
  disabled = false,
}: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "اختر ملف صورة (مثلاً JPG أو PNG)", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), "")
      );
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          image: `data:${file.type};base64,${base64}`,
          contentType: file.type,
        }),
      });
      let json: { success?: boolean; data?: { url?: string }; error?: { message?: string; details?: { detail?: string } } };
      try {
        json = await res.json();
      } catch {
        toast({ title: "فشل الرفع: استجابة غير صحيحة من الخادم", variant: "destructive" });
        return;
      }
      const url = json?.data?.url;
      if (res.ok && url) {
        onChange(url);
        toast({ title: "تم رفع الصورة" });
      } else if (res.status === 501) {
        toast({
          title: "Cloudinary غير مضبوط",
          description: "أضف CLOUDINARY_CLOUD_NAME و API_KEY و API_SECRET في .env أو أضف رابط الصورة يدوياً.",
          variant: "destructive",
        });
      } else {
        const msg = json?.error?.message ?? "فشل الرفع";
        const detail = json?.error?.details?.detail;
        toast({
          title: msg,
          description: detail ? String(detail) : undefined,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "خطأ في الاتصال بالخادم", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="grid gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex items-start gap-4 flex-wrap">
        {value ? (
          <div className="relative rounded-2xl border border-border overflow-hidden bg-muted">
            <img
              src={value}
              alt=""
              className="h-24 w-24 object-cover"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-1 left-1 right-1 opacity-90"
              onClick={() => onChange("")}
              disabled={disabled}
            >
              إزالة
            </Button>
          </div>
        ) : (
          <div className="h-24 w-24 rounded-2xl border border-dashed border-border bg-muted flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "جاري الرفع…" : "رفع صورة"}
          </Button>
          <span className="text-xs text-muted-foreground">
            أو الصق رابط الصورة في الحقل أدناه
          </span>
        </div>
      </div>
    </div>
  );
}
