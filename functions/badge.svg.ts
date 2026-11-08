import { handleBadge } from "./_lib/shareApi";
import type { Env } from "./_lib/checkApi";

export const onRequestGet = ({ request, env }: { request: Request; env: Env }) => handleBadge(request, env);
