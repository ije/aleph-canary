import { useEffect, useRef, useState } from "react";

export default function Index() {
  const [ready, setReady] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { initMonaco, createEditor, createModel, KeyCode, KeyMod } = await import("../lib/editor.ts");
      await initMonaco();
      const editor = createEditor(editorContainerRef.current!);
      editor.addAction({
        id: "export_to_github",
        label: "Deploy: Export Playground to GitHub",
        run() {
          location.href = `/projects/{id}/settings`;
        },
      });
      editor.addAction({
        id: "save",
        label: "Deploy: Save & Deploy",
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run() {
          alert("onSave");
        },
      });
      editor.setModel(createModel("mod.ts", `console.log("Hello, world!");`));
      setReady(true);
    })();
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }} ref={editorContainerRef}>
      {!ready && <p>Loading...</p>}
    </div>
  );
}
