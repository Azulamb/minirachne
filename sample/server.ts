/**
 * Sample server.
 *
 * deno run --allow-read --allow-net --allow-env ./sample/server.ts
 */

//import * as Minirachne from '../mod.ts';
import * as Minirachne from 'https://raw.githubusercontent.com/Azulamb/minirachne/main/mod.ts';

const server = new Minirachne.Server();

class StatusApi implements Minirachne.Route {
	public order!: number;
	public pattern!: URLPattern;
	public middlewares?: Minirachne.Middlewares;

	constructor(order: number, pattern: URLPattern) {
		this.order = order;
		this.pattern = pattern;
	}

	onRequest(data: Minirachne.RequestData): Promise<Response> {
		const body = JSON.stringify({
			framework: Minirachne.NAME,
			version: Minirachne.VERSION,
			std: Minirachne.STD_VERSION,
		});
		const headers = new Headers();
		headers.set('Content-Type', 'application/json');
		headers.set('Content-Length', encodeURI(body).replace(/%../g, '*').length + '');
		const response = new Response(body, { headers: headers });
		return Promise.resolve(response);
	}
}

// Middleware & Route
class SimpleLogin implements Minirachne.Route, Minirachne.Middleware {
	// Route
	public order!: number;
	public pattern!: URLPattern;
	public middlewares: Minirachne.Middlewares;

	constructor(order: number) {
		this.order = order;
		this.pattern = server.router.path('/(login|logout|user)');
		this.middlewares = Minirachne.Middlewares.create(this);
	}

	public async onRequest(data: Minirachne.RequestData) {
		const headers = new Headers();
		headers.set('Location', '/');

		switch (this.getPath(data.request)) {
			case 'login': {
				console.log('Login user:');
				const uid = Math.random().toString(36).slice(-8);
				Minirachne.Cookie.set(headers, { name: 'login', value: uid });
				break;
			}
			case 'logout': {
				console.log('Logout user:');
				Minirachne.Cookie.delete(headers, 'login');
				break;
			}
			case 'user': {
				const headers = new Headers();
				headers.set('Content-Type', 'application/json');
				return new Response(JSON.stringify(data.user), {
					headers: headers,
				});
			}
		}

		return new Response('', { headers: headers, status: 303 });
	}

	// Middleware
	public async handle(data: Minirachne.RequestData) {
		const path = this.getPath(data.request);
		const user = this.getUser(data.request);
		if (path !== 'login' && !user) {
			return Promise.reject(new Error('Login Error.'));
		}
		// Add user data.
		data.user = user;
	}

	// Common
	protected getPath(request: Request) {
		const result = this.pattern.exec(request.url);

		return result?.pathname.groups[0];
	}

	protected getUser(request: Request) {
		const cookie = Minirachne.Cookie.get(request.headers);

		return cookie.login ? { uid: cookie.login } : null;
	}
}

class EchoChat extends Minirachne.WebSocketEvent implements Minirachne.Route {
	public order!: number;
	public pattern!: URLPattern;

	constructor(order: number, pattern: URLPattern) {
		super();
		this.order = order;
		this.pattern = pattern;
	}

	public async onRequest(data: Minirachne.RequestData) {
		return server.upgradeWebSocket(data, this);
	}

	// WebSocketEvent

	public onOpen(ws: WebSocket, event: Event) {
		console.log(`Start EchoChat:`);
	}

	public onMessage(ws: WebSocket, event: MessageEvent) {
		console.log(`Message EchoChat: ${event.data}`);
		ws.send(event.data);
	}

	public onClose(ws: WebSocket, event: CloseEvent) {
		console.log(`Close EchoChat:`);
	}

	public onError(ws: WebSocket, event: Event | ErrorEvent) {
		console.log(`Error EchoChat:`);
	}
}

(() => {
	server.setURL(new URL(Deno.env.get('MINIRACHNE_URL') || 'http://localhost:8080/'));

	// Public document root.
	const publicDocs = Minirachne.createAbsolutePath(import.meta, './public');
	//server.route.add(new Minirachne.StaticRoute(100, new URLPattern('http://localhost:8080/*'), publicDocs));
	//server.route.add(new Minirachne.StaticRoute(100, 'http://localhost:8080/*', publicDocs));
	server.router.add(new Minirachne.StaticRoute(100, server.router.path('/*'), publicDocs));

	// API sample.
	server.router.add(new StatusApi(30, server.router.path('/status')));

	// Create login middleware & route.
	const simpleLogin = new SimpleLogin(0);
	server.router.add(simpleLogin);

	// EchoChat.
	server.router.add(new EchoChat(40, server.router.path('/echochat')), simpleLogin.middlewares);

	// Private document root.
	const privateDocs = Minirachne.createAbsolutePath(import.meta, './private');
	server.router.add(new Minirachne.StaticRoute(50, server.router.path('/*'), privateDocs), simpleLogin.middlewares);

	/**
	 * Proirity
	 * - (0) Simple login.
	 *     Login/Logout/Get user status api.
	 *     Use middleware(Simple login).
	 * - (30) Status API
	 *     Do not use middleware.
	 * - (40) EchoChat
	 *     Use middleware(Simple login).
	 * - (50) Private static file server.
	 *     Use middleware(Simple login).
	 * - (100) Public static file server.
	 *     Do not use middleware.
	 */
	return server.run();
})().then(() => {
	console.log('Exit.');
}).catch((error) => {
	console.error(error);
});
