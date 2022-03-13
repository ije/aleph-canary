/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.50";

/** whether is canary version */
export const isCanary = true;

/** minimum supported deno version */
export const minDenoVersion = "1.18.2";

/** `prepublish` will be invoked before publish */
export async function prepublish(): Promise<boolean> {
  for await (const entry of Deno.readDir("./")) {
    if (entry.name !== "version.ts") {
      await Deno.remove("./" + entry.name, { recursive: true });
    }
  }
  for await (const entry of Deno.readDir("../../alephjs/aleph.js")) {
    console.log(entry.name);
  }
  Deno.exit(0);
  // const p = Deno.run({
  //   cmd: ["deno", "run", "-A", "build.ts"],
  //   cwd: "./compiler",
  //   stdout: "inherit",
  //   stderr: "inherit",
  // });
  // const { success } = await p.status();
  // p.close();
  // return success;
}
