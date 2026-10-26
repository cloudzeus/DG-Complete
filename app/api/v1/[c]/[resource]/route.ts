import { apiHandler } from "@/lib/api-v1";
import { invokeMethod } from "@/lib/methods/invoke";

// {GET|POST|PATCH|PUT|DELETE} /api/v1/{collection}/{resource} — runs the method's workflow (docs/07 §3).
const handler = apiHandler<{ c: string; resource: string }>(async (req, ctx, route) => {
  const { c, resource } = await route.params;
  return invokeMethod(req, ctx, c, resource);
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
