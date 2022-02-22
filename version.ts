/** `VERSION` managed by https://deno.land/x/publish */
export const VERSION = "0.0.7";

/** minimum supported deno version */
export const minDenoVersion = "1.18.2";

/** `prepublish` will be invoked before publish */
export async function prepublish(): Promise<boolean> {
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
