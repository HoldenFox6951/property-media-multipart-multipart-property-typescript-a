import { mediaRequestSchema, planPropertyMediaUpload } from "../src/property_media_upload";

const example = mediaRequestSchema.parse({
  request_id: "971ed30a-f808-4b8f-a583-e98b86f0b91c",
  media_type: "inspection_reminder",
  property_id: "harbor-house",
  record_id: "inspection-2026-10",
  filename: "walkthrough.mp4",
  content_type: "video/mp4",
  size_bytes: 38_000_000,
});

console.log(JSON.stringify(planPropertyMediaUpload(example), null, 2));
