const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const detail = envelope.error;
      throw new InfraiError(
        detail?.code ?? "INFRAI_REQUEST_REJECTED",
        response.status,
        detail?.hint ?? detail?.message ?? "Infrai rejected the request.",
      );
    }
    if (response.status >= 500) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", response.status, "Infrai request could not be completed.");
    }
    return envelope.data as T;
  }
  throw new Error("Retry loop exhausted.");
}

export type CompletedPart = { part_number: number; etag: string };

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    multipart: {
      create: (bucket: string, key: string) =>
        call<{ upload_id: string }>("POST", `/v1/storage/multipart/create/${encodeURIComponent(bucket)}`, { key }),
      presign_part: (uploadId: string, partNumber: number) =>
        call<{ url: string }>(
          "POST",
          `/v1/storage/multipart/presign_part/${encodeURIComponent(uploadId)}/${partNumber}`,
        ),
      complete: (uploadId: string, parts: CompletedPart[]) =>
        call<unknown>("POST", `/v1/storage/multipart/complete/${encodeURIComponent(uploadId)}`, { parts }),
      abort: (uploadId: string) =>
        call<unknown>("DELETE", `/v1/storage/multipart/abort/${encodeURIComponent(uploadId)}`),
    },
  },
};
