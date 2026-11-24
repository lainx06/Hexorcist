// Project guardrails. Plain Node, no dependencies.
// Prints findings as "file:line: message". Exit 0 if clean, 2 otherwise.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const findings = [];

const rel = (p) => relative(root, p).split(sep).join("/");

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function lines(file) {
  return readFileSync(file, "utf8").split(/\r?\n/);
}

function scan(files, rules) {
  for (const file of files) {
    lines(file).forEach((text, i) => {
      for (const { re, msg, honorAllow } of rules) {
        if (honorAllow && text.includes("guard-allow")) continue;
        const m = re.exec(text);
        if (m) findings.push(`${rel(file)}:${i + 1}: ${msg(m[0])}`);
      }
    });
  }
}

const exists = (p) => existsSync(p);
const one = (p) => (exists(p) ? [p] : []);

// a. Claim words
const claimFiles = [
  ...one(join(root, "index.html")),
  ...walk(join(root, "src", "ui")),
  ...one(join(root, "README.md")),
  ...walk(join(root, "docs")),
];
scan(claimFiles, [
  {
    re: /(?<![\w-])(safe|secure|guaranteed|certified|real-time|realtime|first|unique|shortest)(?![\w-])/i,
    msg: (w) => `claim word "${w}" is not allowed (add guard-allow to the line to skip)`,
    honorAllow: true,
  },
]);

// b. Determinism in engine code (tests excluded)
const engineFiles = walk(join(root, "src", "engine")).filter(
  (f) => /\.[cm]?[jt]sx?$/.test(f) && !rel(f).split("/").includes("__tests__"),
);
scan(engineFiles, [
  {
    re: /\b(Date\.now|performance\.now|setTimeout|setInterval|Math\.random)\b|\bnew\s+Date\s*\(/,
    msg: (w) => `nondeterministic API "${w.replace(/\s+/g, " ")}" in engine code`,
  },
]);

// b2. No network or entropy sources in engine code (tests excluded, same files as b)
scan(engineFiles, [
  { re: /\bfetch\s*\(/, msg: () => `network API "fetch(" in engine code` },
  { re: /\bXMLHttpRequest\b/, msg: (w) => `network API "${w}" in engine code` },
  { re: /\bWebSocket\b/, msg: (w) => `network API "${w}" in engine code` },
  {
    re: /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](?:node:)?(?:https|http|net)["']/,
    msg: (w) => `network module import ${w.replace(/^.*?(["'])/, "$1")} in engine code`,
  },
  { re: /\bcrypto\.getRandomValues\b/, msg: (w) => `entropy API "${w}" in engine code` },
  { re: /\brandomUUID\b/, msg: (w) => `entropy API "${w}" in engine code` },
  { re: /\brandomBytes\b/, msg: (w) => `entropy API "${w}" in engine code` },
]);

// c. Isolation: only emulator-bridge.ts may import avr8js
const bridge = "src/engine/emulator-bridge.ts";
const srcFiles = walk(join(root, "src")).filter((f) => /\.[cm]?[jt]sx?$/.test(f));
scan(
  srcFiles.filter((f) => rel(f) !== bridge),
  [
    {
      re: /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']avr8js(?:\/[^"']*)?["']/,
      msg: () => `only ${bridge} may import "avr8js"`,
    },
  ],
);

// c2. Isolation: the test-only construction path may appear only in the bridge and in tests
scan(
  srcFiles.filter((f) => {
    const r = rel(f);
    return r !== bridge && !r.startsWith("src/engine/__tests__/");
  }),
  [
    {
      re: /createWithTestHooks/,
      msg: () => `"createWithTestHooks" may appear only in ${bridge} and src/engine/__tests__/`,
    },
  ],
);

// d. Brand
scan([...one(join(root, "index.html")), ...walk(join(root, "src", "ui"))], [
  {
    re: /\bArduino\b/i,
    msg: () => `brand word "Arduino" is not allowed here`,
  },
]);

if (findings.length === 0) {
  console.log("guard: clean");
  process.exit(0);
}
console.log(findings.join("\n"));
process.exit(2);
