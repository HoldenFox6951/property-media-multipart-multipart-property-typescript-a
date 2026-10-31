import { z } from "zod";
import { infrai, type CompletedPart } from "./infrai_storage";

const MiB = 1_048_576;

export const mediaRequestSchema = z.object({
  request_id: z.string().uuid(),
  media_type: z.enum(["maintenance_request", "tenant_document", "inspection_reminder"]),
  property_id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  record_id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  filename: z.string().min(1).max(180),
  content_type: z.string().min(3).max(120),
  size_bytes: z.number().int().positive().max(50 * 1024 * MiB),
});

export const completionSchema = z.object({
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().min(1),
  })).min(1),
});

export type MediaRequest = z.infer<typeof mediaRequestSchema>;

export type UploadPlan = {
  object_key: string;
  part_size_bytes: number;
  part_count: number;
  retention: "case_record" | "lease_record" | "inspection_record";
};

const policy = {
  maintenance_request: { partSize: 16 * MiB, folder: "maintenance", retention: "case_record" },
  tenant_document: { partSize: 8 * MiB, folder: "tenant-documents", retention: "lease_record" },
  inspection_reminder: { partSize: 12 * MiB, folder: "inspections", retention: "inspection_record" },
} as const;

function safeFilename(filename: string): string {
  return filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media";
}

export function planPropertyMediaUpload(input: MediaRequest): UploadPlan {
  const choice = policy[input.media_type];
  return {
    object_key: `${choice.folder}/${input.property_id}/${input.record_id}/${input.request_id}-${safeFilename(input.filename)}`,
    part_size_bytes: choice.partSize,
    part_count: Math.ceil(input.size_bytes / choice.partSize),
    retention: choice.retention,
  };
}

export async function startPropertyMediaUpload(input: MediaRequest) {
  const plan = planPropertyMediaUpload(input);
  const created = await infrai.storage.multipart.create(propertyMediaBucket, plan.object_key);
  const parts = await Promise.all(
    Array.from({ length: plan.part_count }, async (_, index) => {
      const part_number = index + 1;
      const signed = await infrai.storage.multipart.presign_part(created.upload_id, part_number);
      return { part_number, upload_url: signed.url };
    }),
  );
  return { upload_id: created.upload_id, ...plan, parts };
}

export async function completePropertyMediaUpload(uploadId: string, parts: CompletedPart[]) {
  await infrai.storage.multipart.complete(uploadId, parts);
  return { upload_id: uploadId, state: "stored" as const };
}

export async function cancelPropertyMediaUpload(uploadId: string) {
  await infrai.storage.multipart.abort(uploadId);
  return { upload_id: uploadId, state: "cancelled" as const };
}

export const propertyMediaBucket = process.env.PROPERTY_MEDIA_BUCKET ?? "property-media";

export async function preparePropertyMediaBucket(): Promise<void> {
  await infrai.storage.bucket.create(propertyMediaBucket);
}
