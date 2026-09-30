// Newline-delimited JSON stream: {type:"status",text} … then {type:"result",data} or {type:"error",error}.
// Lets the UI show "AI busy, retrying…" while a long free-model call runs.
export function ndjson(run: (status: (text: string) => void) => Promise<unknown>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const data = await run((text) => send({ type: "status", text }));
        send({ type: "result", data });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

// Client side: read the stream, reporting status lines; resolves with the result.
export async function readNdjson<T>(res: Response, onStatus: (t: string) => void): Promise<T> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "status") onStatus(msg.text);
      else if (msg.type === "result") return msg.data as T;
      else if (msg.type === "error") throw new Error(msg.error);
    }
  }
  throw new Error("The answer was cut off. Please try again.");
}
