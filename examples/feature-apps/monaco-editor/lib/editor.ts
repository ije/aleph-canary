// Copyright Deno Land Inc. All Rights Reserved. Proprietary and confidential.

import { editor, KeyCode, KeyMod, languages, Uri } from "https://esm.sh/monaco-editor@0.33.0";
import editorWorker from "https://esm.sh/monaco-editor@0.33.0/esm/vs/editor/editor.worker?worker";
import tsWorker from "https://esm.sh/monaco-editor@0.33.0/esm/vs/language/typescript/ts.worker?worker";
import "https://esm.sh/monaco-editor@0.33.0?css";

// @ts-expect-error This is defined, but TS doesn't like it.
globalThis.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "typescript" || label === "javascript") {
      return tsWorker();
    }
    return editorWorker();
  },
};

export async function initMonaco() {
  const [denoNs, dom, domIterable, domAsyncIterable, domFetchEvent, esnextArray, esnextError, esnextObject] =
    await Promise.all(
      [
        "/types/lib.deno.ns.d.ts ",
        "/types/lib.dom.d.ts ",
        "/types/lib.dom.iterable.d.ts ",
        "/types/lib.dom.asynciterable.d.ts ",
        "/types/lib.dom.fetchevent.d.ts ",
        "/types/lib.esnext.array.d.ts ",
        "/types/lib.esnext.error.d.ts ",
        "/types/lib.esnext.object.d.ts ",
      ].map((path) => fetch(path).then((res) => res.text())),
    );

  const { typescript } = languages;
  const { typescriptDefaults, javascriptDefaults } = typescript;

  // clear default libs
  javascriptDefaults.setExtraLibs([]);
  typescriptDefaults.setExtraLibs([]);

  for (
    const [text, name] of [
      [denoNs, "deno.ns"],
      [dom, "dom_"],
      [domIterable, "dom.iterable"],
      [domAsyncIterable, "dom.asynciterable"],
      [domFetchEvent, "dom.fetchevent"],
      [esnextArray, "esnext.array"],
      [esnextError, "esnext.error"],
      [esnextObject, "esnext.object"],
    ]
  ) {
    javascriptDefaults.addExtraLib(text, `lib.${name}.d.ts`);
    typescriptDefaults.addExtraLib(text, `lib.${name}.d.ts`);
  }

  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    lib: [
      "esnext",
      "esnext.array",
      "esnext.error",
      "esnext.object",
      "dom_",
      "dom.iterable",
      "dom.asynciterable",
      "dom.fetchevent",
      "deno.ns",
    ],
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    jsx: typescript.JsxEmit.React,
    jsxFactory: "h",
    jsxFragmentFactory: "Fragment",
  };
  typescriptDefaults.setCompilerOptions(compilerOptions);
  javascriptDefaults.setCompilerOptions(compilerOptions);

  const diagnosticOptions = { diagnosticCodesToIgnore: [2691] };
  javascriptDefaults.setDiagnosticsOptions(diagnosticOptions);
  typescriptDefaults.setDiagnosticsOptions(diagnosticOptions);
}

export function createModel(name: string, source: string) {
  let lang: string | undefined;
  if (name.endsWith(".ts") || name.endsWith(".tsx")) {
    lang = "typescript";
  } else if (name.endsWith(".js") || name.endsWith(".jsx")) {
    lang = "javascript";
  }
  const uri = Uri.parse(`file:///playground/${name}`);
  const model = editor.createModel(source, lang, uri);
  return model;
}

export function createEditor(container: HTMLElement, readOnly?: boolean) {
  return editor.create(container, {
    readOnly,
    automaticLayout: true,
    contextmenu: false,
    fontFamily: '"Dank Mono", "Source Code Pro", monospace',
    fontLigatures: true,
    fontSize: 14,
    lineHeight: 18,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    scrollbar: {
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
    overviewRulerLanes: 0,
  });
}

export { KeyCode, KeyMod };
