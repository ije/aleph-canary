import { resolve } from "https://deno.land/std@0.128.0/path/mod.ts";

/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.65";

/** whether is canary version */
export const isCanary = true;

/** minimum supported deno version */
export const minDenoVersion = "1.18.2";

/** `prepublish` will be invoked before publish */
export async function prepublish(): Promise<boolean> {
  let tasks: Promise<unknown>[] = [];
  for await (const entry of Deno.readDir("./")) {
    if (![".git", "version.ts"].includes(entry.name)) {
      tasks.push(Deno.remove("./" + entry.name, { recursive: true }));
    }
  }
  console.log("Clean up...");
  await Promise.all(tasks);

  tasks = [];
  for await (const entry of Deno.readDir("../../alephjs/aleph.js")) {
    if (![".git", "version.ts", ".DS_Store"].includes(entry.name)) {
      const src = resolve("../../alephjs/aleph.js", entry.name);
      const dest = resolve("./", entry.name);
      const p = Deno.run({
        cmd: ["cp", "-Rf", src, dest],
        stdout: "inherit",
        stderr: "inherit",
      });
      tasks.push(p.status());
    }
  }
  console.log("Copying files...");
  await Promise.all(tasks);

  return true;

  const p = Deno.run({
    cmd: ["deno", "run", "-A", "build.ts"],
    cwd: "./compiler",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await p.status();
  p.close();
  return success;
}
