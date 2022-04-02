export const VERSION = '0.133.0';
export * from 'https://deno.land/std@0.133.0/http/server.ts';
export { dirname, extname, fromFileUrl, join } from 'https://deno.land/std@0.133.0/path/mod.ts';
import { getCookies, setCookie, deleteCookie } from 'https://deno.land/std@0.133.0/http/cookie.ts';
export const Cookie = { get: getCookies, set: setCookie, delete: deleteCookie };
export { Status, STATUS_TEXT } from 'https://deno.land/std@0.133.0/http/http_status.ts';
