/**
 * Re-export of the shared CLI helpers.
 *
 * These moved to `@complifine/core` once the AI package grew a CLI of its own
 * and a second copy would have started drifting. Kept as a named module here
 * so `kb`'s imports read locally rather than reaching across packages for
 * argument parsing.
 */

export {
  CHECK,
  CROSS,
  WARN,
  flagBool,
  flagList,
  flagNumber,
  flagString,
  formatDuration,
  heading,
  parseArgs,
  stripAnsi,
  style,
  table,
  timed,
  wrapText,
  type Args,
} from "@complifine/core";
