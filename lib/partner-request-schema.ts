import { z } from "zod";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

function optionalUrl() {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (typeof s === "string" ? s.trim() : "") || null)
    .refine((v) => v === null || v.length <= 500, "الرابط طويل جداً")
    .optional()
    .nullable();
}

export const partnerRequestBodySchema = z.object({
  requestType: z.enum(["AGENT", "DISTRIBUTOR"]),
  name: z.string().min(1, "الاسم مطلوب").max(200).transform((s) => s.trim()),
  governorate: z.string().min(1, "المحافظة مطلوبة").max(100).transform((s) => s.trim()),
  phone: z
    .string()
    .min(1, "رقم التليفون مطلوب")
    .max(30)
    .transform((s) => s.trim())
    .refine((s) => normalizeEgyptMobilePhone(s) !== null, EGYPT_MOBILE_ERROR_MESSAGE)
    .transform((s) => normalizeEgyptMobilePhone(s) as string),
  facebookUrl: optionalUrl(),
  instagramUrl: optionalUrl(),
  tiktokUrl: optionalUrl(),
  youtubeUrl: optionalUrl(),
  websiteUrl: optionalUrl(),
  otherUrl: optionalUrl(),
});

export type PartnerRequestBody = z.infer<typeof partnerRequestBodySchema>;
