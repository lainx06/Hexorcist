// headless-runner: process entry for `npm run check`. Sets process.exitCode (not process.exit) so stdout can drain.
import { main } from "./main";
import { nodeReader, toolVersion } from "./node-io";

process.exitCode = main(process.argv.slice(2), {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  reader: nodeReader(),
  toolVersion: toolVersion(),
});
