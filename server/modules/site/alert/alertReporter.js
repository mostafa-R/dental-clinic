/**
 * Lazy event->alert bridge. Backend events (backup failure/success,
 * auto-suspension) notify the alert engine without importing it eagerly at
 * module load, keeping the caller's unit tests free of model/DB coupling.
 */
export async function reportEventAlert(event) {
  try {
    const { raiseAlert, recoverAlert } = await import("./alertEngine.js");
    if (event?.action === "recover") {
      return recoverAlert(event);
    }
    return raiseAlert(event);
  } catch (err) {
    console.error("[AlertReporter] Failed to report event alert:", err.message);
    return null;
  }
}