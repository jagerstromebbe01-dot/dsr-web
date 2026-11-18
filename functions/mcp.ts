import { handleMcp } from "./_lib/mcp";
import type { Env } from "./_lib/checkApi";

// One handler for every method: POST does the work, others get a clean 405 / CORS preflight.
export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleMcp(request, env);
