// The bundled Heartbeat example, imported as text at build time.
import buggyHex from "../../../../examples/heartbeat/buggy/buggy.hex?raw";
import buggySketch from "../../../../examples/heartbeat/buggy/buggy.ino?raw";
import fixedHex from "../../../../examples/heartbeat/fixed/fixed.hex?raw";
import fixedSketch from "../../../../examples/heartbeat/fixed/fixed.ino?raw";
import fixtureText from "../../../../examples/heartbeat/fixture.json?raw";
import metaText from "../../../../examples/heartbeat/meta.json?raw";
import rulesText from "../../../../examples/heartbeat/rules.txt?raw";
import type { ExampleTexts } from "./examples";

export function loadHeartbeat(): ExampleTexts {
  return { buggyHex, fixedHex, fixtureText, rulesText, metaText, buggySketch, fixedSketch };
}
