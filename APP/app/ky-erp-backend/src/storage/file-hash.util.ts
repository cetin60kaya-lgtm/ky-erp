import { createHash } from "crypto";
import * as fs from "fs";

export function calculateFileHash(input: string | Buffer) {
  const hash = createHash("sha256");
  if (Buffer.isBuffer(input)) {
    hash.update(input);
  } else {
    hash.update(fs.readFileSync(input));
  }
  return hash.digest("hex");
}