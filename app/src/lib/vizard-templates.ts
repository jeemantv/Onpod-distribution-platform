// Vizard branding templates we want to expose in the Clips modal.
//
// Vizard's open-api does NOT provide an endpoint to list templates —
// you maintain this list by hand. To add a new template:
//   1. Build it in app.vizard.ai → grab the template ID from the URL.
//   2. Add a new entry below.
//   3. (Optional) Drop a preview image at
//      `app/public/vizard-templates/{id}.jpg` (or .png) and it auto-shows
//      on the picker card — no explicit `previewUrl` needed.
//   4. Push.
//
// Same convention works for Vizard's preset/built-in templates: grab
// their IDs from the dashboard and add an entry here.

export interface VizardTemplate {
  /** Vizard template ID (the long number shown in your dashboard). */
  id: string;
  /** Short human-friendly name shown under the preview tile. */
  name: string;
  /**
   * Optional explicit preview URL. When omitted, the modal looks for
   * `/vizard-templates/{id}.jpg` (or .png) in the public folder. So you
   * can just drop an image with the right filename and skip this field.
   */
  previewUrl?: string;
  /**
   * Set by `/api/vizard/templates` when an admin has put a lock code on
   * the template. Clients see this flag but never the code; the modal
   * prompts for the 4 digits and `POST /api/vizard/templates/verify`
   * does the comparison server-side.
   */
  locked?: boolean;
}

export const VIZARD_TEMPLATES: VizardTemplate[] = [
  { id: "91261482", name: "Yellow pop" },
  { id: "91261271", name: "Red white" },
  { id: "91261015", name: "Black and white simple" },
];
