/** Framework name. */
export const NAME = 'Minirachne';

export * from './version.ts';

export * from './types.d.ts';

import { dirname, fromFileUrl, join, VERSION } from './src/denostd.ts';
/** Use Deno std version. */
export const STD_VERSION = VERSION;

export { Server } from './src/server.ts';

export { Middlewares } from './src/middleware.ts';

export { Cookie } from './src/denostd.ts';

export function createAbsolutePath(meta: ImportMeta, path = '') {
	return join(dirname(fromFileUrl(meta.url)), path);
}

// HTTP Redirect.
export * from './src/redirect.ts';

// HTTP Error.
export * from './src/httperror.ts';

// Static routes.
export { StaticRoute } from './src/static.ts';

// WebSocket listener.
export { WebSocketListener } from './src/ws.ts';
