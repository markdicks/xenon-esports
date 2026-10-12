import type { SubmissionResult } from "@/lib/form-results";

const maximumBodyBytes = 1024 * 1024;

function json(result: SubmissionResult, status: number) {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleFormSubmission(
  request: Request,
  submit: (formData: FormData) => Promise<SubmissionResult>,
) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    || request.headers.get("host") || new URL(request.url).host;
  try {
    if (!origin || new URL(origin).host.toLowerCase() !== host.toLowerCase()
      || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ success: false, error: "validation" }, 403);
    }
  } catch {
    return json({ success: false, error: "validation" }, 403);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maximumBodyBytes) {
    return json({ success: false, error: "validation" }, 413);
  }
  let formData: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ success: false, error: "validation" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBodyBytes) {
        await reader.cancel();
        return json({ success: false, error: "validation" }, 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    formData = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return json({ success: false, error: "validation" }, 400);
  }

  try {
    const result = await submit(formData);
    return json(result, result.success ? 200 : result.error === "validation" ? 400 : 503);
  } catch (error) {
    console.error("Form submission handler failed", error);
    return json({ success: false, error: "database" }, 503);
  }
}
