import 'reflect-metadata';
import express from 'express';
import type { Request, ErrorRequestHandler } from 'express';

type Type = new (...args: any[]) => object;
type ModuleOptions = { providers: Type[]; controllers: Type[] };
type Route = { method: 'get' | 'post'; path: string; key: string | symbol };
type Extract = (request: Request) => unknown;
const MODULE = Symbol('module');
const PREFIX = Symbol('prefix');
const ROUTES = Symbol('routes');
const PARAMS = Symbol('params');

export function Module(options: ModuleOptions): ClassDecorator {
  return (target) => { Reflect.defineMetadata(MODULE, options, target); };
}

export function Controller(prefix: string): ClassDecorator {
  return (target) => { Reflect.defineMetadata(PREFIX, prefix, target); };
}

function route(method: Route['method'], path: string): MethodDecorator {
  return (target, key) => {
    const routes: Route[] = Reflect.getOwnMetadata(ROUTES, target) ?? [];
    Reflect.defineMetadata(ROUTES, [...routes, { method, path, key }], target);
  };
}
export const Get = (path = '') => route('get', path);
export const Post = (path = '') => route('post', path);

function argument(extract: Extract): ParameterDecorator {
  return (target, key, index) => {
    if (key === undefined) throw new Error('Only route parameters are supported');
    const params: Map<number, Extract> =
      Reflect.getOwnMetadata(PARAMS, target, key) ?? new Map();
    params.set(index, extract);
    Reflect.defineMetadata(PARAMS, params, target, key);
  };
}
export const Body = () => argument((request) => request.body);
export const Param = (name: string) => argument((request) => request.params[name]);

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function createMiniApp(root: Type) {
  const options: ModuleOptions | undefined = Reflect.getOwnMetadata(MODULE, root);
  if (!options) throw new Error('Root module metadata is missing');
  const allowed = new Set([...options.providers, ...options.controllers]);
  const instances = new Map<Type, object>();
  const constructing = new Set<Type>();

  function resolve(type: Type): object {
    if (!allowed.has(type)) throw new Error(`Provider is not registered: ${type.name}`);
    const existing = instances.get(type);
    if (existing) return existing;
    if (constructing.has(type)) throw new Error(`Circular dependency: ${type.name}`);
    const deps: Type[] | undefined = Reflect.getOwnMetadata('design:paramtypes', type);
    if (!deps && type.length > 0) throw new Error(`Constructor metadata is missing: ${type.name}`);
    constructing.add(type);
    try {
      const instance = new type(...(deps ?? []).map(resolve));
      instances.set(type, instance);
      return instance;
    } finally {
      constructing.delete(type);
    }
  }

  for (const type of allowed) resolve(type);
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  const registered = new Set<string>();

  for (const type of options.controllers) {
    const prefix: string | undefined = Reflect.getOwnMetadata(PREFIX, type);
    if (prefix === undefined) throw new Error(`Controller prefix is missing: ${type.name}`);
    const instance = resolve(type);
    const routes: Route[] = Reflect.getOwnMetadata(ROUTES, type.prototype) ?? [];
    for (const route of routes) {
      const path = prefix + route.path;
      const signature = `${route.method} ${path}`;
      if (registered.has(signature)) throw new Error(`Duplicate route: ${signature}`);
      registered.add(signature);
      const handler: unknown = Reflect.get(instance, route.key);
      if (typeof handler !== 'function') throw new Error('Route handler is not a function');
      const params: Map<number, Extract> =
        Reflect.getOwnMetadata(PARAMS, type.prototype, route.key) ?? new Map();
      app[route.method](path, async (request, response) => {
        const args: unknown[] = [];
        for (const [index, extract] of params) args[index] = extract(request);
        const result = await handler.apply(instance, args);
        response.status(route.method === 'post' ? 201 : 200).json(result);
      });
    }
  }

  app.use((_request, response) => {
    response.status(404).json({ error: 'Route not found' });
  });
  const onError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) return next(error);
    const parserType = error !== null && typeof error === 'object' && 'type' in error
      ? error.type : undefined;
    const status = error instanceof HttpError ? error.status
      : parserType === 'entity.parse.failed' ? 400
      : parserType === 'entity.too.large' ? 413 : 500;
    if (status === 500) console.error(error);
    const message = error instanceof HttpError ? error.message
      : status === 400 ? 'Invalid JSON'
      : status === 413 ? 'Request body is too large' : 'Internal server error';
    response.status(status).json({ error: message });
  };
  app.use(onError);
  return app;
}
