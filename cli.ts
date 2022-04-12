import { bold } from "https://deno.land/std@0.134.0/fmt/colors.ts";
import { readLines } from "https://deno.land/std@0.134.0/io/mod.ts";
import { writeAll } from "https://deno.land/std@0.134.0/streams/conversion.ts";
import { basename, resolve } from "https://deno.land/std@0.134.0/path/mod.ts";
import { readImportMap } from "./server/config.ts";
import { parse } from "./lib/flags.ts";
import { findFile } from "./lib/fs.ts";
import log, { stripColor } from "./lib/log.ts";
import { serveDir } from "./lib/serve.ts";
import util from "./lib/util.ts";
import { VERSION } from "./version.ts";

const commands = {
  "init": "Create a new app",
  "dev": "Start the app in `development` mode",
  "start": "Start the app in `production` mode",
  "build": "Build the app into a worker",
};

const helpMessage = `Aleph.js v${VERSION}
The Full-stack Framework in Deno.

Docs: https://alephjs.org/docs
Bugs: https://github.com/alephjs/aleph.js/issues

Usage:
    deno run -A https://deno.land/x/aleph/cli.ts <command> [...options]

Commands:
    ${
  Object.entries(commands).map(([name, desc]) => `${name.padEnd(15)}${desc}`)
    .join("\n    ")
}

Options:
    -v, --version  Prints version number
    -h, --help     Prints help message
`;

async function main() {
  const { args, options } = parse();

  // prints aleph.js version
  if (options.v) {
    console.log(`aleph.js v${VERSION}`);
    Deno.exit(0);
  }

  // prints aleph.js and deno version
  if (options.version) {
    const { deno, v8, typescript } = Deno.version;
    console.log([
      `aleph.js ${VERSION}`,
      `deno ${deno}`,
      `v8 ${v8}`,
      `typescript ${typescript}`,
    ].join("\n"));
    Deno.exit(0);
  }

  // prints help message when the command not found
  if (!(args.length > 0 && args[0] in commands)) {
    console.log(helpMessage);
    Deno.exit(0);
  }

  const command = String(args.shift()) as keyof typeof commands;

  // prints command help message
  if (options.h || options.help) {
    const { helpMessage: cmdHelpMessage } = await import(
      `./commands/${command}.ts`
    );
    console.log(commands[command]);
    console.log(cmdHelpMessage);
    Deno.exit(0);
  }

  // invoke `init` command
  if (command === "init") {
    const { default: init } = await import(`./commands/init.ts`);
    await init(args[0], options?.template);
    return;
  }

  // get moudle cache directory
  const p = Deno.run({
    cmd: [Deno.execPath(), "info", "--json"],
    stdout: "piped",
    stderr: "null",
  });
  const output = (new TextDecoder()).decode(await p.output());
  const { modulesCache } = JSON.parse(output);
  if (util.isFilledString(modulesCache)) {
    Deno.env.set("MODULES_CACHE_DIR", modulesCache);
  }
  p.close();

  const runOptions: RunOptions = {};

  if (Deno.env.get("ALEPH_DEV")) {
    runOptions.denoConfigFile = resolve("./deno.json");
    runOptions.importMapFile = resolve("./import_map.json");
    Deno.env.set("ALEPH_DEV_ROOT", Deno.cwd());
    Deno.env.set("ALEPH_DEV_PORT", "2020");
    serveDir({ cwd: Deno.cwd(), port: 2020 });
    log.debug(`Proxy https://deno.land/x/aleph on http://localhost:2020`);
  } else {
    runOptions.denoConfigFile = await findFile(["deno.jsonc", "deno.json", "tsconfig.json"]);
    runOptions.importMapFile = await findFile(
      ["import_map", "import-map", "importmap", "importMap"].map((name) => `${name}.json`),
    );
    if (runOptions.importMapFile) {
      try {
        let update: boolean | null = null;
        const importMap = await readImportMap(runOptions.importMapFile);
        for (const key in importMap.imports) {
          const url = importMap.imports[key];
          if (
            /\/\/deno\.land\/x\/aleph(_canary)?@v?\d+\.\d+\.\d+(-[a-z0-9\.]+)?\//.test(url)
          ) {
            const [prefix, rest] = util.splitBy(url, "@");
            const [ver, suffix] = util.splitBy(rest, "/");
            if (command === "dev" && ver !== VERSION && update === null) {
              update = confirm(
                `You are using a different version of Aleph.js, expect ${ver} -> v${bold(VERSION)}, update '${
                  basename(runOptions.importMapFile)
                }'?`,
              );
              if (!update) {
                runOptions.version = ver;
                runOptions.isCanary = prefix.endsWith("_canary");
                break;
              }
            }
            if (update) {
              importMap.imports[key] = `${prefix}@${VERSION}/${suffix}`;
            }
          }
        }
        if (update) {
          await Deno.writeTextFile(
            runOptions.importMapFile,
            JSON.stringify({ imports: importMap.imports, scopes: importMap.scopes }, undefined, 2),
          );
        }
      } catch (e) {
        log.error(`invalid '${basename(runOptions.importMapFile)}':`, e.message);
        if (!confirm("Continue?")) {
          Deno.exit(1);
        }
      }
    }
  }

  if (args.length > 0) {
    Deno.chdir(String(args[0]));
  }
  await run(command, runOptions);
}

type RunOptions = {
  version?: string;
  isCanary?: boolean;
  denoConfigFile?: string;
  importMapFile?: string;
};

async function run(command: string, options: RunOptions) {
  const { version, isCanary, denoConfigFile, importMapFile } = options;
  const rwDirs = [".", Deno.env.get("MODULES_CACHE_DIR"), Deno.env.get("ALEPH_DEV_ROOT")].filter(Boolean);
  const cmd: string[] = [
    Deno.execPath(),
    "run",
    "--allow-env",
    "--allow-net",
    "--allow-read=" + rwDirs.join(","),
    "--allow-write=" + rwDirs.join(","),
    "--allow-hrtime",
    "--location=http://localhost",
    "--no-check",
  ];
  const devPort = Deno.env.get("ALEPH_DEV_PORT");
  if (devPort) {
    cmd.push(`--reload=http://localhost:${devPort}`);
  }
  if (denoConfigFile) {
    cmd.push("--config", denoConfigFile);
  }
  if (importMapFile) {
    cmd.push("--import-map", importMapFile);
  }
  if (version) {
    const pkgName = isCanary ? "aleph_canary" : "aleph";
    cmd.push(`https://deno.land/x/${pkgName}@${version}/commands/${command}.ts`);
    Deno.env.set("ALEPH_VERSION", version);
  } else if (devPort) {
    cmd.push(`http://localhost:${devPort}/commands/${command}.ts`);
  } else {
    cmd.push(new URL(`./commands/${command}.ts`, import.meta.url).href);
  }
  cmd.push(...Deno.args.slice(1));
  const p = Deno.run({ cmd, stdout: "piped", stderr: "piped" });
  pipe(p.stdout, Deno.stdout);
  pipe(p.stderr, Deno.stderr);
  const { code } = await p.status();
  Deno.exit(code);
}

async function pipe(reader: Deno.Reader, writer: Deno.Writer) {
  for await (const line of readLines(reader)) {
    const newLine = fixLine(line);
    if (newLine !== null) {
      await writeAll(writer, util.utf8TextEncoder.encode(newLine + "\n"));
    }
  }
}

const regStackLoc = /(http:\/\/localhost:60\d{2}\/.+)(:\d+:\d+)/;

function fixLine(line: string): string | null {
  const l = stripColor(line);
  if (l.startsWith(`Download http://localhost:`)) {
    return null;
  }
  const ret = l.match(regStackLoc);
  if (ret) {
    const url = new URL(ret[1]);
    return l.replace(ret[0], `.${url.pathname}${ret[2]}`);
  }
  return line;
}

if (import.meta.main) {
  main();
}
