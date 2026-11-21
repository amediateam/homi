import { type NextRequest, NextResponse } from "next/server";

import { STUB_SCENARIO_COOKIE, stubScenarioHeaders } from "@/lib/api/scenario";
import { sameOrigin } from "@/lib/security/sameOrigin";
import { apiBaseUrl, SESSION_COOKIE } from "@/lib/session/server";

/**
 * The owner form's photo upload (WP-81, DEC-92, `03` Q-APP-031): the browser reports upload progress only to
 * `XMLHttpRequest`, and a Server Action goes through `fetch`, so the form sends each shrunk photo here. The one write
 * of `/bff` besides the journal (it amends WP-22's rule and `25` §3.5 for this method): same-origin only; the token
 * from the cookie or the bearer header, so both session modes work; a ULID id; a multipart body of at most 4 MB
 * holding one `file`, forwarded as `file` named `photo.jpg` to `POST /owner/listings/{id}/photos`; the API's status
 * and JSON passed on unchanged, without its headers, never cached.
 */

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** A multipart envelope around the file: its boundaries and headers. */
const ENVELOPE_BYTES = 16 * 1024;
const API_TIMEOUT_MS = 90_000;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

function refuse(status: number, code: string): NextResponse {
  const response = NextResponse.json({ success: false, message: code, code }, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function tokenOf(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value || (/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!sameOrigin(request, true)) {
    return refuse(403, "forbidden");
  }
  const id = (await params).id;
  if (!ULID.test(id)) {
    return refuse(404, "not_found");
  }
  // A declared length over the limit is refused before the body is read.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + ENVELOPE_BYTES) {
    return refuse(413, "too_large");
  }
  const token = tokenOf(request);
  if (token === null) {
    return refuse(401, "unauthenticated");
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return refuse(422, "invalid");
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return refuse(422, "invalid");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return refuse(413, "too_large");
  }

  const body = new FormData();
  body.append("file", file, "photo.jpg");
  let api: Response;
  try {
    api = await fetch(`${apiBaseUrl()}/owner/listings/${id}/photos`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Id": crypto.randomUUID().replaceAll("-", ""),
        ...(request.headers.get("accept-language") ? { "Accept-Language": request.headers.get("accept-language")! } : {}),
        ...stubScenarioHeaders(request.cookies.get(STUB_SCENARIO_COOKIE)?.value),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError" ? refuse(504, "gateway_timeout") : refuse(502, "bad_gateway");
  }
  const response = new NextResponse(await api.text(), { status: api.status, headers: { "Content-Type": "application/json" } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
