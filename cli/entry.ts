// The one entry-point test used by every runnable module (Requirement 14.1).
import path from "node:path";
import { fileURLToPath } from "node:url";

const norm = (p: string): string => path.resolve(p).replace(/\\/g, "/").toLowerCase();

/** True when the script Node was started with is the module file, ignoring case and separator style. */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined || argv1 === "") return false;
  return norm(fileURLToPath(moduleUrl)) === norm(argv1);
}
