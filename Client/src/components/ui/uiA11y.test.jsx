import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';

import Button from './Button';
import { Field, TextInput, Select } from './Field';
import EmptyState from './EmptyState';

/**
 * Rendered accessibility checks.
 *
 * These exist because a static scan of the JSX cannot tell whether a control has
 * an accessible name: it cannot follow `Field`'s `htmlFor`/`id` pairing, and it
 * cannot see that a component renders a real `<label>`. Rendering and asking the
 * accessibility tree is the only reliable check.
 *
 * The rule enforced throughout: a control is named by a real `<label for>` /
 * wrapping label, and must NOT also carry an `aria-label` (WCAG 2.5.3 — a
 * visible label must contain the accessible name).
 */

const store = {
  getState: () => ({ users: { myPermissions: null }, auth: { user: null } }),
  subscribe: () => () => {},
  dispatch: vi.fn(),
};

const withStore = (ui) => render(<Provider store={store}>{ui}</Provider>);

beforeEach(cleanup);
afterEach(cleanup);

/** The accessible name the browser computes for a control. */
const accessibleName = (el) => {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  if (el.id) {
    // jsdom does not provide CSS.escape; ids under test are plain identifiers.
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  // A button or link is named by its own subtree text.
  const text = el.textContent?.trim();
  if (text) return text;
  const title = el.getAttribute('title');
  return title ? title.trim() : '';
};

describe('Field pairs label and control', () => {
  it('names a text input via a real <label for>', () => {
    withStore(
      <Field label="First name" htmlFor="firstName">
        <TextInput id="firstName" />
      </Field>,
    );
    expect(accessibleName(screen.getByRole('textbox'))).toBe('First name');
  });

  it('emits a <label for> that points at the control id', () => {
    withStore(
      <Field label="Phone" htmlFor="phone">
        <TextInput id="phone" />
      </Field>,
    );
    const label = document.querySelector('label[for="phone"]');
    expect(label).toBeTruthy();
    expect(label.textContent).toContain('Phone');
  });

  it('names a select via a real <label for>', () => {
    withStore(
      <Field label="Branch" htmlFor="branch">
        <Select id="branch" value="" onChange={() => {}}>
          <option value="">Choose</option>
        </Select>
      </Field>,
    );
    expect(accessibleName(screen.getByRole('combobox'))).toBe('Branch');
  });

  it('does not shadow a visible label with an aria-label', () => {
    withStore(
      <Field label="Email" htmlFor="email">
        <TextInput id="email" />
      </Field>,
    );
    // WCAG 2.5.3: a visible label must be part of the accessible name.
    expect(screen.getByRole('textbox').getAttribute('aria-label')).toBeNull();
  });

  it('links a described-by hint to the control', () => {
    const { container } = withStore(
      <Field label="Password" htmlFor="password" hint="At least 8 characters">
        <TextInput id="password" type="password" />
      </Field>,
    );
    // A password input has no implicit ARIA role, so it is queried by label.
    const input = screen.getByLabelText('Password');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy)?.textContent).toContain('At least 8');
    expect(container).toBeTruthy();
  });

  it('announces a validation error and links it to the control', () => {
    withStore(
      <Field label="Last name" htmlFor="lastName" error="Last name is required">
        <TextInput id="lastName" />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(/\s+/)).toContain('lastName-error');
    expect(document.getElementById('lastName-error')?.textContent).toContain('required');
  });
});

describe('Button', () => {
  it('gives an icon-only button an accessible name', () => {
    withStore(
      <Button aria-label="Delete patient">
        <svg />
      </Button>,
    );
    expect(accessibleName(screen.getByRole('button'))).toBe('Delete patient');
  });

  it('exposes the disabled state', () => {
    withStore(<Button disabled>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.disabled).toBe(true);
    expect(btn).toHaveProperty('disabled', true);
  });

  it('keeps a text button named by its own text content', () => {
    withStore(<Button>Save patient</Button>);
    expect(accessibleName(screen.getByRole('button'))).toBe('Save patient');
  });
});

describe('EmptyState', () => {
  it('exposes a status role so screen readers announce it', () => {
    withStore(<EmptyState title="No patients" description="Add your first patient" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
