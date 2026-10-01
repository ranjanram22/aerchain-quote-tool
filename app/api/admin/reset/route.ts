import { resetDemo } from "@/lib/demo-reset";
import { ndjson } from "@/lib/stream";

export const maxDuration = 300;

// POST { confirm: "RESET" } → wipes and reloads the demo data, streaming progress.
export async function POST(req: Request) {
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== "RESET") return Response.json({ error: 'Type RESET to confirm.' }, { status: 400 });
  return ndjson(async (status) => resetDemo(status));
}
