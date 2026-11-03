import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");

test("Drive mevcut dosya konumu: SQL yer tutucuları ile bind parametreleri birebir", () => {
  // D1 rejects an extra parameter; a repeated scan fails after the first indexed file.
  const sql = "UPDATE file_hub_locations SET provider_file_id=?,relative_path=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?";
  assert.ok(source.includes(sql), "Expected existing-file location UPDATE not found");
  assert.equal(sql.match(/\\?/g)?.length, 6);
  assert.ok(
    source.includes(".bind(text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, location.id).run();"),
    "The existing-file UPDATE must bind exactly six parameters in SQL order",
  );
  assert.ok(!source.includes(".bind(text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, seenAt, location.id).run();"));
});
