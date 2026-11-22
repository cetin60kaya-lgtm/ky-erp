/** A known cloud FILE deletion is a delta operation, not a reason to
 * re-index the entire company archive. Folder or unrecognized deletions are
 * reconciled conservatively because folders are not file assets in D1.
 */
export function cloudRemovalRequiresFullReconciliation(
  wasIndexedFile: boolean, isFolder: boolean,
): boolean {
  return isFolder || !wasIndexedFile;
}
