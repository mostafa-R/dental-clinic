/**
 * Pure invoice form <-> payload transforms.
 *
 * Kept out of `InvoiceFormModal.jsx` so the component file only exports a
 * component (React Fast Refresh) and so the payload rules - which are the part
 * with real edge cases - can be tested without mounting the modal.
 */

export const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0 };

function parseDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Kept UTC-based, matching the previous implementation: a local-time
  // conversion shifts the seeded due date by a day either side of UTC.
  return date.toISOString().slice(0, 10);
}

/** Seeds the edit form from an invoice record. */
export function toForm(invoice) {
  return {
    patient: invoice.patient?._id || invoice.patient || '',
    branch: invoice.branch?._id || invoice.branch || '',
    items:
      invoice.items?.length > 0
        ? invoice.items.map((it) => ({
            description: it.description || '',
            quantity: it.quantity ?? 1,
            unitPrice: it.unitPrice ?? 0,
          }))
        : [{ ...EMPTY_ITEM }],
    discount: invoice.discount ? String(invoice.discount) : '',
    discountType: invoice.discountType || 'fixed',
    discountRate: invoice.discountRate ? String(invoice.discountRate) : '',
    tax: invoice.tax ? String(invoice.tax) : '',
    taxRate: invoice.taxRate ? String(invoice.taxRate) : '',
    dueDate: parseDate(invoice.dueDate),
    notes: invoice.notes || '',
  };
}

/**
 * Builds the PATCH/POST body from the form state.
 *
 * The server applies each field only when its key is present, so every optional
 * field used to be sent only when non-empty. Clearing the discount, tax, due
 * date or notes and pressing save looked like it worked but silently kept the
 * old value on the invoice.
 *
 * `original` is the record the form was seeded from, which is what makes the
 * difference between "never set" and "just cleared" expressible.
 */
export function buildPayload(form, original) {
  const items = form.items
    .filter((it) => it.description.trim())
    .map((it) => ({
      description: it.description.trim(),
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
    }));
  const payload = { items };

  // A field is sent whenever it has a value OR when it had one and was just
  // cleared. Omitting an untouched field still matters: the server rejects a
  // paid invoice with a 409 if any financial field appears in the payload.
  const num = (current, previous) => {
    if (current !== '') return Number(current) || 0;
    if (previous !== undefined && previous !== null && previous !== '') return 0;
    return undefined;
  };

  const discount = num(form.discount, original?.discount);
  if (discount !== undefined) payload.discount = discount;
  if (form.discountType) payload.discountType = form.discountType;

  // The form swaps the discount input between a rate and an amount, but the
  // hidden one keeps its old value in state. Saving in `fixed` mode would
  // otherwise persist a stale rate, which reappears if the user later switches
  // back to `percentage`. The rate is only wiped when it actually held
  // something, so a paid invoice is never sent an untouched financial field.
  if (form.discountType === 'percentage') {
    const discountRate = num(form.discountRate, original?.discountRate);
    if (discountRate !== undefined) payload.discountRate = discountRate;
  } else if (original?.discountType === 'percentage' || Number(original?.discountRate) > 0) {
    payload.discountRate = 0;
  }

  const tax = num(form.tax, original?.tax);
  if (tax !== undefined) payload.tax = tax;
  const taxRate = num(form.taxRate, original?.taxRate);
  if (taxRate !== undefined) payload.taxRate = taxRate;

  if (form.dueDate) {
    payload.dueDate = new Date(form.dueDate).toISOString();
  } else if (original?.dueDate) {
    // Explicit null clears it server-side.
    payload.dueDate = null;
  }

  // Notes are always sent so clearing the box actually clears the field.
  payload.notes = form.notes.trim();
  if (form.branch) payload.branch = form.branch;
  return payload;
}
