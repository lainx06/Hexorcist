// Feature: rule-compiler. Example tests for the ruling that the Signal_Names `all` and `any`
// are rejected in any letter case (Req 1.7, Req 3.7). Evidence, not proof.
import { describe, expect, it } from "vitest";
import { readIr } from "../rules/ir";
import { parse } from "../rules/parse";
import { render } from "../rules/render";
import { oraclePrefix } from "./rules-prefix-oracle";

const irNever = (signal: string): string =>
  JSON.stringify({
    version: 1,
    rules: [{ form: "never", condition: { op: "eq", signal, value: 1 } }],
  });

describe("Signal_Name case of all and any", () => {
  it("parse rejects All, ANY, Any and aLL as a signal", () => {
    for (const name of ["All", "ALL", "ANY", "Any", "aLL", "aNy"]) {
      const r = parse(`${name} is 1 must never happen.`);
      expect(r.ok, name).toBe(false);
      if (!r.ok) {
        expect(r.reason.length).toBeGreaterThanOrEqual(1);
        expect(r.reason.length).toBeLessThanOrEqual(200);
        expect(r.reason, name).not.toContain(name);
      }
    }
    expect(parse("All is 1 must never happen.").ok).toBe(false);
  });

  it("parse rejects the same names inside a list and in a respond sentence", () => {
    expect(parse("all of (ANY is 1, b is 0) must never happen.").ok).toBe(false);
    expect(parse("Within 5 ms after All is 1 becomes true, b is 1 must be true.").ok).toBe(false);
  });

  it("readIr rejects an IR signal ANY, ALL, Any with the path and no signal text", () => {
    for (const name of ["ANY", "ALL", "Any", "aLl"]) {
      const r = readIr(irNever(name));
      expect(r.ok, name).toBe(false);
      if (!r.ok) {
        expect(r.reasons.length).toBeGreaterThanOrEqual(1);
        const joined = r.reasons.join("\n");
        expect(joined, name).toContain("rules[0].condition.signal");
        expect(joined, name).not.toContain(name);
      }
    }
  });

  it("render rejects a Rule whose signal is ANY or All", () => {
    for (const name of ["ANY", "All"]) {
      const r = render({ form: "never", condition: { op: "eq", signal: name, value: 1 } });
      expect(r.ok, name).toBe(false);
    }
  });

  it("names that merely contain the words are still accepted", () => {
    for (const name of ["allx", "any_1", "Allowed", "xall", "Anyone"]) {
      const p = parse(`${name} is 1 must never happen.`);
      expect(p.ok, name).toBe(true);
      expect(readIr(irNever(name)).ok, name).toBe(true);
    }
  });

  it("the Prefix_Oracle agrees: All is not viable, Alls is viable", () => {
    expect(oraclePrefix("All is").viable).toBe(false);
    expect(oraclePrefix("ANY is").viable).toBe(false);
    expect(oraclePrefix("Alls is").viable).toBe(true);
  });
});