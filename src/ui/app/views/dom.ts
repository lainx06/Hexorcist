// Element helpers. Text goes in through textContent only, so data never becomes markup.

export type Child = Node | string | null | undefined | false;

export type Attrs = Record<string, string | number | boolean | null | undefined>;

function apply(node: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(node: Node, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  append(node, children);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs: Attrs = {}, children: readonly Child[] = []): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  apply(node, attrs);
  append(node, children);
  return node;
}

export function clear(node: Node): void {
  while (node.lastChild !== null) node.removeChild(node.lastChild);
}

export function setChildren(node: Node, children: readonly Child[]): void {
  clear(node);
  append(node, children);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}