import { handleCheck, handleMethodNotAllowed, handleOptions } from "../_lib/checkApi";
import type { Env } from "../_lib/checkApi";

interface Context {
  request: Request;
  env: Env;
}

export const onRequestPost = ({ request, env }: Context) => handleCheck(request, env);
export const onRequestOptions = () => handleOptions();
// Any other method (GET, PUT, ...). More specific handlers above win.
export const onRequest = () => handleMethodNotAllowed();
