import * as asserts from '../_setup.ts';
import * as Minirachne from '../../mod.ts';

const testDir = Minirachne.createAbsolutePath(import.meta, '../tmp');

class SimpleLogin implements Minirachne.Route, Minirachne.Middleware {
  // Route
  public order!: number;
  public pattern!: URLPattern;
  public middleware: Minirachne.MiddlewareManager;

  constructor(server: Minirachne.Server, base = '') {
    this.pattern = server.router.path(`${base}/(login|logout|user)`);
    this.middleware = Minirachne.MiddlewareManager.create(this);
  }

  public onRequest(data: Minirachne.RequestData) {
    const headers = new Headers();

    switch (this.getPath(data.request)) {
      case 'login': {
        const uid = Math.random().toString(36).slice(-8);
        Minirachne.Cookie.set(headers, { name: 'login', value: uid });
        break;
      }
      case 'logout': {
        Minirachne.Cookie.delete(headers, 'login');
        break;
      }
      case 'user': {
        return Minirachne.Response.JSON(data.detail.user);
      }
    }

    return Promise.resolve(Minirachne.Redirect.SeeOther('/', { headers: headers }));
  }

  // Middleware
  public handle(data: Minirachne.RequestData) {
    const path = this.getPath(data.request);
    const user = this.getUser(data.request);
    if (path !== 'login' && !user) {
      return Promise.reject(new Error('Login Error.'));
    }
    // Add user data.
    data.detail.user = user;
    return Promise.resolve();
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

class PasswordMiddleware implements Minirachne.Middleware {
  public password: string;
  constructor(password: string) {
    this.password = password;
  }
  handle(data: Minirachne.RequestData): Promise<unknown> {
    const cookie = Minirachne.Cookie.get(data.request.headers);
    if (cookie.password !== `password=${this.password}`) {
      return Promise.reject(new Error('Login Error.'));
    }
    return Promise.resolve();
  }
}

class SubRouterMiddleware implements Minirachne.Middleware {
  handle(data: Minirachne.RequestData): Promise<unknown> {
    if (data.request.method !== 'GET') {
      return Promise.reject(new Error('Method Error.'));
    }
    return Promise.resolve();
  }
}

class AddDataMiddleware implements Minirachne.Middleware {
  public key: string;
  public value: string;
  constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }
  handle(data: Minirachne.RequestData): Promise<unknown> {
    data.detail[this.key] = this.value;
    return Promise.resolve();
  }
}

Deno.test('File server', async () => {
  const url = new URL('http://localhost:18080/');

  const server = new Minirachne.Server();
  server.setURL(url);

  const p = server.start();

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 500);
    return response.text();
  });

  server.router.add('/*', new Minirachne.StaticRoute(testDir));

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 200);
    asserts.assertEquals(response.headers.get('content-type'), 'text/html');
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Test page');
  });

  await fetch(new URL('/private/index.html', url)).then((response) => {
    asserts.assertEquals(response.status, 200);
    asserts.assertEquals(response.headers.get('content-type'), 'text/html');
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Private page');
  });

  await fetch(new URL('test.png', url)).then((response) => {
    asserts.assertEquals(response.status, 404);
    return response.text();
  });

  server.stop();
  await p;
});

Deno.test('Use middleware', async () => {
  const url = new URL('http://localhost:18080/');

  const server = new Minirachne.Server();
  server.setURL(url);

  const simpleLogin = new SimpleLogin(server, '/auth');
  server.router.add(simpleLogin);

  const privateDir = Minirachne.createAbsolutePath(import.meta, '../tmp/private');
  server.router.add('/*', new Minirachne.StaticRoute(privateDir), simpleLogin.middleware);

  const publicDir = Minirachne.createAbsolutePath(import.meta, '../tmp/public');
  server.router.add('/*', new Minirachne.StaticRoute(publicDir));

  const p = server.start();

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Public page');
  });

  const cookie = await fetch(new URL('/auth/login', url), { redirect: 'manual' }).then(async (response) => {
    asserts.assertEquals(response.status, 303);
    await response.text();
    return <string> response.headers.get('set-cookie');
  });

  await fetch(url, { headers: new Headers({ Cookie: cookie }) }).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Private page');
  });

  await fetch(new URL('/publiconly.txt', url), { headers: new Headers({ Cookie: cookie }) }).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Public only');
  });

  server.stop();
  await p;
});

Deno.test('Use middleware(Failure)', async () => {
  const url = new URL('http://localhost:18080/');

  const server = new Minirachne.Server();
  server.setURL(url);

  const middleware = new Minirachne.MiddlewareManager();
  middleware.add(new PasswordMiddleware('pass1'));
  middleware.add(new PasswordMiddleware('pass2'));

  const privateDir = Minirachne.createAbsolutePath(import.meta, '../tmp/private');
  server.router.add('/*', new Minirachne.StaticRoute(privateDir), middleware);

  const publicDir = Minirachne.createAbsolutePath(import.meta, '../tmp/public');
  server.router.add('/*', new Minirachne.StaticRoute(publicDir));

  const p = server.start();

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Public page');
  });

  await fetch(url, { headers: new Headers({ Cookie: 'password=pass1' }) }).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Public page');
  });

  await fetch(url, { headers: new Headers({ Cookie: 'password=pass2' }) }).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Public page');
  });

  server.stop();
  await p;
});

Deno.test('Use middleware(Add data)', async () => {
  const url = new URL('http://localhost:18080/');

  const server = new Minirachne.Server();
  server.setURL(url);

  const middleware = new Minirachne.MiddlewareManager();
  middleware.add(new AddDataMiddleware('name', 'Hoge'));
  middleware.add(new AddDataMiddleware('job', 'Student'));

  server.router.add(
    '/*',
    new class implements Minirachne.RouteLike {
      onRequest(this: Minirachne.Route, data: Minirachne.RequestData): Promise<Response> {
        return Promise.resolve(new Response(JSON.stringify(data.detail)));
      }
    }(),
    middleware,
  );

  const p = server.start();

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.json();
  }).then((body) => {
    asserts.assertEquals(body, { name: 'Hoge', job: 'Student' });
  });

  server.stop();
  await p;
});

Deno.test('Use middleware(With sub router)', async () => {
  const url = new URL('http://localhost:18080/');

  const server = new Minirachne.Server();
  server.setURL(url);

  const middleware = new Minirachne.MiddlewareManager();
  middleware.add(new SubRouterMiddleware());

  const subRouter = new Minirachne.Router();
  subRouter.add('/*', () => {
    return Promise.resolve(new Response('sub'));
  }, middleware);

  server.router.addRouter('/sub', subRouter, middleware);
  server.router.add(
    '/test',
    () => {
      return Promise.resolve(new Response('main'));
    },
  );

  const p = server.start();

  const list: { url: string; status: number; body?: string; method?: string }[] = [
    { url: '/test', status: 200, body: 'main' },
    { url: '/sub/test', status: 200, body: 'sub' },
    { url: '/sub/test', status: 500, method: 'POST' },
  ];

  for (const item of list) {
    const response = await fetch(new URL(item.url, url), { method: item.method || 'GET' });
    asserts.assertEquals(response.status, item.status, `${item.method || 'GET'}:${item.url} - ${response.status}`);
    const body = await response.text();
    if (item.status === 200) {
      asserts.assertEquals(body, item.body);
    }
  }

  server.stop();
  await p;
});

Deno.test('Use middleware(Basic auth)', async () => {
  const baseUrl = new URL('http://localhost:0/'); // Port 0 is random port.
  const user = 'root';
  const password = 'password';
  const base64 = btoa(`${user}:${password}`);

  const server = new Minirachne.Server();
  server.setURL(baseUrl);

  const message = 'SECRET PAGE';
  const middleware = new Minirachne.BasicAuth(message);
  middleware.addUser(user, password);

  server.router.add('/*', new Minirachne.StaticRoute(testDir), middleware);

  const p = server.start();
  const url = server.getURL();

  await fetch(url).then((response) => {
    asserts.assertEquals(response.status, 401);
    asserts.assertEquals(response.headers.get('WWW-Authenticate'), `Basic realm="${message}"`);
    return response.text();
  }).then((body) => {
    asserts.assertNotEquals(body.trim(), 'Test page');
  });

  await fetch(url, { headers: { 'Authorization': `Basic ${base64}` } }).then((response) => {
    asserts.assertEquals(response.status, 200);
    return response.text();
  }).then((body) => {
    asserts.assertEquals(body.trim(), 'Test page');
  });

  server.stop();
  await p;
});
