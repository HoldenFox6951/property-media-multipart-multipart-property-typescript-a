import assert from "node:assert/strict";
import test from "node:test";
import { mediaRequestSchema, planPropertyMediaUpload } from "../src/property_media_upload";

test("tenant evidence uses smaller parts and a stable lease-record key", () => {
  const input = mediaRequestSchema.parse({
    request_id: "a3c89706-fef4-438f-bc89-a9208731cadd",
    media_type: "tenant_document",
    property_id: "elm-court",
    record_id: "lease-204",
    filename: "Signed lease (final).pdf",
    content_type: "application/pdf",
    size_bytes: 21 * 1_048_576,
  });

  assert.deepEqual(planPropertyMediaUpload(input), {
    object_key: "tenant-documents/elm-court/lease-204/a3c89706-fef4-438f-bc89-a9208731cadd-Signed-lease-final-.pdf",
    part_size_bytes: 8 * 1_048_576,
    part_count: 3,
    retention: "lease_record",
  });
});

test("a request without a positive byte count is rejected at the boundary", () => {
  const result = mediaRequestSchema.safeParse({
    request_id: "a3c89706-fef4-438f-bc89-a9208731cadd",
    media_type: "maintenance_request",
    property_id: "elm-court",
    record_id: "repair-9",
    filename: "leak.mov",
    content_type: "video/quicktime",
    size_bytes: 0,
  });
  assert.equal(result.success, false);
});
