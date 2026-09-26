// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { translations, t } from "../../../lib/i18n";

/**
 * Guards the tenant form's admin-name keys.
 *
 * `translations.en` and `translations.ar` are single flat objects, so two
 * features that want the same key name silently collapse into one entry — the
 * later definition wins. That is not a lint nit: `adminName` already exists in
 * the Admins section as "Name", so adding `adminName` for the tenant form's
 * "Admin Name" label left the form rendering the Admins wording, in both
 * languages, with no error anywhere.
 *
 * These keys are therefore namespaced `clinicAdmin*`, and the assertions below
 * pin that down: a key is only correct if it resolves to the intended string
 * AND is not a duplicate of an unrelated feature's key.
 */

const TENANT_FORM_KEYS = [
  "clinicAdminName",
  "clinicAdminNamePlaceholder",
  "clinicAdminNameSameAsClinic",
  "clinicAdminNameTooShort",
  "credentialsName",
];

describe("tenant form i18n keys", () => {
  for (const language of ["en", "ar"]) {
    describe(language, () => {
      it.each(TENANT_FORM_KEYS)("defines %s", (key) => {
        expect(translations[language][key]).toBeTruthy();
      });

      it.each(TENANT_FORM_KEYS)("resolves %s to a real string, not the key", (key) => {
        expect(t(key, language)).not.toBe(key);
      });

      it("does not shadow the Admins section's own adminName", () => {
        // The whole point of the `clinicAdmin` prefix: the Admins table still
        // needs its short "Name" label, and the tenant form needs a distinct
        // one. Collapsing them would relabel the wrong screen.
        expect(translations[language].adminName).toBeTruthy();
        expect(t("adminName", language)).not.toBe(t("clinicAdminName", language));
      });
    });
  }

  it("keeps the English and Arabic admin-name labels distinct", () => {
    expect(t("clinicAdminName", "en")).toBe("Admin Name");
    expect(t("clinicAdminName", "ar")).toBe("اسم المدير");
  });

  it("has an Arabic string for every English key the tenant form uses", () => {
    for (const key of TENANT_FORM_KEYS) {
      expect(translations.ar[key], `missing ar.${key}`).toBeTruthy();
    }
  });

  it("declares each key exactly once per language", () => {
    // The real duplicate detector. `Object.entries` walks an object literal
    // that has already collapsed its duplicates, so it cannot see the problem;
    // this counts the declarations in the source instead. Without it a key
    // reused by another feature is invisible here and only shows up as the
    // wrong label on screen.
    // `import.meta.url` is only a file: URL under the node environment; under
    // jsdom it is an http: URL and readFileSync refuses it.
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../lib/i18n.js"),
      "utf8",
    );
    for (const key of TENANT_FORM_KEYS) {
      const declarations = source.match(
        new RegExp(`^\\s{4}${key}:`, "gm"),
      ) || [];
      expect(
        declarations.length,
        `"${key}" is declared ${declarations.length} times — once per language is expected`,
      ).toBe(2);
    }
  });

  it("pins the resolved values so a shadowed key cannot pass", () => {
    // If `clinicAdminName` were ever shadowed by another section's key, the
    // lookup would silently return that other string. Comparing against the
    // literal expected text catches it, which a "is it truthy" check does not.
    for (const key of TENANT_FORM_KEYS) {
      expect(t(key, "en")).toBe(en[key]);
      expect(t(key, "ar")).toBe(ar[key]);
    }
  });
});

/** The values the tenant form expects, kept beside the assertions on purpose. */
const en = {
  clinicAdminName: "Admin Name",
  clinicAdminNamePlaceholder: "e.g., Dr. Sara Ahmed",
  clinicAdminNameSameAsClinic: "Leave blank to use the clinic name.",
  clinicAdminNameTooShort: "Must be at least 2 characters",
  credentialsName: "Name:",
};

const ar = {
  clinicAdminName: "اسم المدير",
  clinicAdminNamePlaceholder: "مثال: د. سارة أحمد",
  clinicAdminNameSameAsClinic: "اتركه فارغاً لاستخدام اسم العيادة.",
  clinicAdminNameTooShort: "يجب ألا يقل عن حرفين",
  credentialsName: "الاسم:",
};
