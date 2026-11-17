// Keyboard access, checked in the source text of src/ui/app/views and app.css (polish pass 1, item 25).
// No browser. These checks read text, so they are evidence about the source, not proof that Tab works.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const APP = join(ROOT, "src", "ui", "app");
const VIEWS = join(APP, "views");
const CSS = join(APP, "app.css");
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const stripTs = (t: string) => t.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripCss = (t: string) => t.replace(/\/\*[^]*?\*\//g, "");

/** Tags that are interactive on their own. A click handler on any other element is a finding. */
const NATIVE = new Set(["button", "input", "select", "textarea", "a", "summary", "option"]);
const POINTER_EVENTS = "click|dblclick|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend";

/** Click-like handlers on elements made with el("<tag>") or svg("<tag>") that are not native controls. */
export function handlersOnPlainElements(source: string): string[] {
  const tagOf = new Map<string, string>();
  const decl = /(?:const|let)\s+(\w+)\s*=\s*(?:\w+\(\s*)?(?:el|svg)\(\s*"(\w+)"/g;
  for (let m = decl.exec(source); m !== null; m = decl.exec(source)) tagOf.set(m[1] as string, m[2] as string);
  const out: string[] = [];
  const use = new RegExp(`(\\w+)\\.addEventListener\\(\\s*"(${POINTER_EVENTS})"`, "g");
  for (let m = use.exec(source); m !== null; m = use.exec(source)) {
    const tag = tagOf.get(m[1] as string);
    if (tag !== undefined && !NATIVE.has(tag)) out.push(`${m[1] as string} (<${tag}>) listens for ${m[2] as string}`);
  }
  const inline = /\b(?:el|svg)\(\s*"(\w+)"\s*,\s*\{[^}]*\bon(?:click|mousedown|mouseup|pointerdown|touchstart)\b/g;
  for (let m = inline.exec(source); m !== null; m = inline.exec(source)) {
    if (!NATIVE.has(m[1] as string)) out.push(`<${m[1] as string}> has an inline click handler`);
  }
  if (/\.on(?:click|mousedown|mouseup|pointerdown)\s*=/.test(source)) out.push("an onclick property is assigned");
  return out;
}

/** role="button" on an element that is not a button. */
export function roleButtonOnPlainElements(source: string): string[] {
  const out: string[] = [];
  const call = /\b(?:el|svg)\(\s*"(\w+)"\s*,\s*\{([^}]*)\}/g;
  for (let m = call.exec(source); m !== null; m = call.exec(source)) {
    if (m[1] !== "button" && /\brole"?\s*:\s*"button"/.test(m[2] as string)) out.push(`<${m[1] as string}> has role="button"`);
  }
  if (/<(?:div|span)\b[^>]*\brole="button"/.test(source)) out.push('<div> or <span> markup has role="button"');
  if (/setAttribute\(\s*"role"\s*,\s*"button"\s*\)/.test(source)) out.push('role="button" is set with setAttribute');
  return out;
}

/** tabindex above 0, in an attribute object, markup, setAttribute or the tabIndex property. */
export function positiveTabindex(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\btabindex"?\s*:\s*"?([1-9]\d*)"?/g,
    /\btabindex="([1-9]\d*)"/g,
    /setAttribute\(\s*"tabindex"\s*,\s*"?([1-9]\d*)"?\s*\)/g,
    /\btabIndex\s*=\s*([1-9]\d*)/g,
  ];
  for (const re of patterns) for (let m = re.exec(source); m !== null; m = re.exec(source)) out.push(`tabindex ${m[1] as string}`);
  return out;
}

/** CSS rules (and TS style writes) that remove the outline with no replacement in the same rule. */
export function outlineRemoved(css: string): string[] {
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(css); m !== null; m = rule.exec(css)) {
    const body = m[2] as string;
    if (/\boutline(?:-style)?\s*:\s*(?:none|0)\b/.test(body) && !/\bbox-shadow\s*:\s*(?!none)/.test(body)) {
      out.push(`${(m[1] as string).trim()} removes the outline`);
    }
  }
  return out;
}

const tsFiles = walk(VIEWS).filter((f) => f.endsWith(".ts"));
const read = (f: string) => readFileSync(f, "utf8");

describe("a11y scanners (they flag what they should)", () => {
  it("flags a click handler on a div, role=button on a span, tabindex 3 and outline: none", () => {
    expect(handlersOnPlainElements('const box = el("div", {}, []);\nbox.addEventListener("click", go);')).toHaveLength(1);
    expect(handlersOnPlainElements('const b = el("button", {}, []);\nb.addEventListener("click", go);')).toHaveLength(0);
    expect(handlersOnPlainElements('const s = svg("svg", {}, []);\ns.addEventListener("click", go);')).toHaveLength(1);
    expect(handlersOnPlainElements('el("span", { onclick: "x" })')).toHaveLength(1);
    expect(roleButtonOnPlainElements('el("span", { class: "x", role: "button" }, [])')).toHaveLength(1);
    expect(roleButtonOnPlainElements('el("button", { role: "button" }, [])')).toHaveLength(0);
    expect(positiveTabindex('el("div", { tabindex: 3 })')).toHaveLength(1);
    expect(positiveTabindex('el("div", { tabindex: 0 }); el("div", { tabindex: -1 })')).toHaveLength(0);
    expect(outlineRemoved(".a:focus { outline: none; }")).toHaveLength(1);
    expect(outlineRemoved(".a:focus { outline: none; box-shadow: 0 0 0 3px #fff; }")).toHaveLength(0);
  });
});

describe("keyboard access in src/ui/app/views and app.css", () => {
  it("scans the view files", () => {
    expect(tsFiles.length).toBeGreaterThan(10);
  });

  it("no click handler on a non-interactive element", () => {
    const bad = tsFiles.flatMap((f) => handlersOnPlainElements(stripTs(read(f))).map((s) => `${rel(f)}: ${s}`));
    expect(bad).toEqual([]);
  });

  it('no role="button" on a div or span (or any element that is not a button)', () => {
    const bad = tsFiles.flatMap((f) => roleButtonOnPlainElements(stripTs(read(f))).map((s) => `${rel(f)}: ${s}`));
    expect(bad).toEqual([]);
  });

  it("no positive tabindex", () => {
    const bad = tsFiles.flatMap((f) => positiveTabindex(stripTs(read(f))).map((s) => `${rel(f)}: ${s}`));
    expect(bad).toEqual([]);
  });

  it("no outline removed without a replacement, in the stylesheet or in a script", () => {
    const css = outlineRemoved(stripCss(readFileSync(CSS, "utf8"))).map((s) => `${rel(CSS)}: ${s}`);
    const ts = tsFiles.filter((f) => /style\.outline\s*=\s*["'](?:none|0)/.test(stripTs(read(f)))).map((f) => `${rel(f)}: style.outline`);
    expect([...css, ...ts]).toEqual([]);
  });

  it("the stylesheet gives every control a focus ring of at least 3 px", () => {
    const css = stripCss(readFileSync(CSS, "utf8"));
    const m = /:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    const width = /outline\s*:\s*(\d+)px\s+solid/.exec((m as RegExpExecArray)[1] as string);
    expect(width).not.toBeNull();
    expect(Number((width as RegExpExecArray)[1])).toBeGreaterThanOrEqual(3);
  });

  it("arrow keys are read only on the tabs and the scrubber: no key listener on document or window", () => {
    const bad = tsFiles.filter((f) => /\b(?:document|window)\.addEventListener\(\s*"key(?:down|up|press)"/.test(stripTs(read(f)))).map(rel);
    expect(bad).toEqual([]);
    const tabs = stripTs(read(join(VIEWS, "tabs.ts")));
    expect(tabs).toMatch(/t\.addEventListener\("keydown"/);
  });

  it("the page never sets inert or tabindex on anything but the collapsed setup body, panels and cards", () => {
    // Every inert and tabindex in the views, with the file that owns it. A new one has to be added here on purpose.
    const found = tsFiles
      .flatMap((f) => {
        const t = stripTs(read(f));
        const hits: string[] = [];
        if (/\binert\b/.test(t)) hits.push("inert");
        for (const m of t.matchAll(/\btabindex"?\s*:\s*(-?\d+)/g)) hits.push(`tabindex ${m[1] as string}`);
        return hits.map((h) => `${rel(f)}: ${h}`);
      })
      .sort();
    expect(found).toEqual(
      [
        "src/ui/app/views/fix-view.ts: tabindex 0",
        "src/ui/app/views/setup.ts: inert",
        "src/ui/app/views/speed-page.ts: tabindex 0",
        "src/ui/app/views/tabs.ts: tabindex 0",
        "src/ui/app/views/verdict-card.ts: tabindex -1",
      ].sort(),
    );
  });
});
