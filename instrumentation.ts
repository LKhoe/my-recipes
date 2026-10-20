// Runs once when the server starts. The playlist import queue's loop lives in this process (see
// lib/services/import-queue.ts); starting it here resumes videos left waiting by a restart.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startImportWorker } = await import("@/lib/services/import-queue");
  startImportWorker();
}
