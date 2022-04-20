import { extname, globToRegExp, join } from "https://deno.land/std@0.135.0/path/mod.ts";
import { getFiles } from "../lib/fs.ts";
import type { Route, Routes } from "../lib/route.ts";
import { URLPatternCompat, type URLPatternInput } from "../lib/urlpattern.ts";
import util from "../lib/util.ts";
import type { DependencyGraph } from "./graph.ts";
import type { AlephConfig, RoutesConfig } from "./types.ts";

type RouteRegExp = {
  prefix: string;
  test(filename: string): boolean;
  exec(filename: string): URLPatternInput | null;
};

const routeModules: Map<string, Record<string, unknown>> = new Map();

/** register route module */
export function register(filename: string, module: Record<string, unknown>) {
  routeModules.set(filename, module);
}

export async function importRouteModule(filename: string) {
  let mod: Record<string, unknown>;
  if (routeModules.has(filename)) {
    mod = routeModules.get(filename)!;
  } else {
    const graph: DependencyGraph | undefined = Reflect.get(globalThis, "serverDependencyGraph");
    const version = graph?.get(filename)?.version || graph?.mark(filename, {}).version || Date.now().toString(16);
    const port = Deno.env.get("ALEPH_MODULES_PROXY_PORT");
    mod = await import(`http://localhost:${port}${filename.slice(1)}?v=${version}`);
  }
  return mod;
}

/* check if the filename is a route */
export function isRouteFile(filename: string): boolean {
  const currentRoutes: Routes | undefined = Reflect.get(globalThis, "__ALEPH_ROUTES");
  const index = currentRoutes?.routes.findIndex(([_, meta]) => meta.filename === filename);
  if (index !== undefined && index !== -1) {
    return true;
  }
  const config: AlephConfig | undefined = Reflect.get(globalThis, "__ALEPH_CONFIG");
  if (config && config.routeFiles) {
    const reg = toRouteRegExp(config.routeFiles);
    return reg.test(filename);
  }
  return false;
}

/** initialize routes from routes config */
export async function initRoutes(
  config: string | RoutesConfig | RouteRegExp,
  cwd = Deno.cwd(),
): Promise<Routes> {
  const reg = isRouteRegExp(config) ? config : toRouteRegExp(config);
  const files = await getFiles(join(cwd, reg.prefix));
  const routes: Route[] = [];
  let _app: Route | undefined = undefined;
  let _404: Route | undefined = undefined;
  let _error: Route | undefined = undefined;
  files.forEach((file) => {
    const filename = reg.prefix + file.slice(1);
    const pattern = reg.exec(filename);
    if (pattern) {
      const route: Route = [
        new URLPatternCompat(pattern),
        { pattern, filename },
      ];
      routes.push(route);
      if (pattern.pathname === "/_app") {
        _app = route;
      } else if (pattern.pathname === "/_404") {
        _404 = route;
      } else if (pattern.pathname === "/_error") {
        _error = route;
      }
    }
  });
  if (routes.length > 0) {
    // sort routes by length of pathname
    routes.sort((a, b) => getRouteOrder(a) - getRouteOrder(b));
    // check nesting routes
    routes.forEach(([_, meta]) => {
      const { pattern: { pathname } } = meta;
      const nesting = pathname === "/_app" || (pathname !== "/" && !pathname.endsWith("/index") &&
        routes.findIndex(([_, { pattern: { pathname: p } }]) => p !== pathname && p.startsWith(pathname + "/")) !==
          -1);
      if (nesting) {
        meta.nesting = true;
      }
    });
  }
  const ret = { routes, _404, _app, _error };
  Reflect.set(globalThis, "__ALEPH_ROUTES", ret);
  return ret;
}

/** convert route config to `RouteRegExp` */
export function toRouteRegExp(config: string | RoutesConfig): RouteRegExp {
  const isObject = util.isPlainObject(config);
  const prefix = "." + util.cleanPath(isObject ? config.dir : config.split("*")[0]);
  const reg = isObject
    ? {
      test: (s: string) =>
        s.startsWith(prefix) &&
        config.exts.findIndex((ext) => ext.startsWith(".") ? s.endsWith(ext) : s.endsWith(`.${ext}`)) !== -1,
    }
    : globToRegExp("./" + util.trimPrefix(util.trimPrefix(config, "/"), "./"));

  return {
    prefix,
    test: (s: string) => reg.test(s),
    exec: (filename: string): URLPatternInput | null => {
      if (reg.test(filename)) {
        const parts = util.splitPath(util.trimPrefix(filename, prefix)).map((part) => {
          // replace `/blog/[...path]` to `/blog/:path+`
          if (part.startsWith("[...") && part.includes("]") && part.length > 5) {
            return ":" + part.slice(4).replace("]", "+");
          }
          // replace `/blog/[id]` to `/blog/:id`
          if (part.startsWith("[") && part.includes("]") && part.length > 2) {
            return ":" + part.slice(1).replace("]", "");
          }
          // replace `/blog/$id` to `/blog/:id`
          if (part.startsWith("$") && part.length > 1) {
            return ":" + part.slice(1);
          }
          return part;
        });
        let host: string | undefined = undefined;
        if (isObject && config.host && parts.length > 1 && parts[0].startsWith("@")) {
          host = parts.shift()!.slice(1);
        }
        const basename = parts.pop()!;
        const pathname = "/" + [...parts, util.trimSuffix(basename, extname(basename))].join("/");
        return { host, pathname: pathname === "/index" ? "/" : pathname };
      }
      return null;
    },
  };
}

// check if route is index route
function isRouteRegExp(v: unknown): v is RouteRegExp {
  return util.isPlainObject(v) && typeof v.test === "function" && typeof v.exec === "function";
}

/** get route order by pathname length */
function getRouteOrder([_, meta]: Route): number {
  const { pattern, filename } = meta;
  switch (pattern.pathname) {
    case "/_404":
    case "/_app":
    case "/_error":
      return 0;
    default:
      return filename.split("/").length + (pattern.pathname.split("/:").length - 1) * 0.01;
  }
}
