const prefixes = new WeakMap<Function, string>();
const routes = new WeakMap<object, Map<string, string | symbol>>();

function Group(prefix: string): ClassDecorator {
  console.log('evaluate Group', prefix);
  return (constructor) => {
    console.log('apply Group', constructor.name);
    prefixes.set(constructor, prefix);
  };
}

function Get(path: string): MethodDecorator {
  console.log('evaluate Get', path);
  return (prototype, key, descriptor) => {
    console.log('apply Get', String(key), typeof descriptor.value);
    let entries = routes.get(prototype);
    if (!entries) {
      entries = new Map();
      routes.set(prototype, entries);
    }
    entries.set(path, key);
  };
}

@Group('/notes')
class NotesController {
  private readonly label = 'saved';

  @Get('/preview')
  preview(text: string): string {
    return `${this.label}: ${text}`;
  }
}

console.log('before new');
const controller = new NotesController();
const handlers = new Map<string, (text: string) => unknown>();
const prototype = Object.getPrototypeOf(controller);
for (const [path, key] of routes.get(prototype) ?? []) {
  const method: unknown = Reflect.get(controller, key);
  if (typeof method !== 'function') throw new Error('Route is not a method');
  const prefix = prefixes.get(NotesController);
  if (prefix === undefined) throw new Error('Route group is missing');
  handlers.set(prefix + path, (text) => method.call(controller, text));
}

console.log('registered', [...handlers.keys()]);
for (const path of ['/notes/preview', '/preview']) {
  const handler = handlers.get(path);
  console.log('dispatch', path, handler ? handler('hello') : 'not found');
}
