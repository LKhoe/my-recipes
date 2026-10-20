// Client-side signal between the playlist picker and the progress popup (ImportProgress), which
// live in different parts of the tree: queueing a batch makes the popup fetch right away instead
// of waiting for its next poll.
export const IMPORT_BATCHES_CHANGED = "import-batches-changed";

export function notifyImportBatchesChanged() {
  window.dispatchEvent(new Event(IMPORT_BATCHES_CHANGED));
}
