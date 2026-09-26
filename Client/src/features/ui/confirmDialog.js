let _state = { open: false, title: '', message: '', confirmLabel: '', cancelLabel: '', danger: false };
let _listener = null;
let _resolve = null;

export function getConfirmState() {
  return _state;
}

export function subscribeConfirm(fn) {
  _listener = fn;
}

function emit() {
  _listener?.(_state);
}

export function requestConfirm(opts) {
  return new Promise((resolve) => {
    // A new request supersedes any prompt still on screen (e.g. a double
    // submit, or a second delete while the first dialog is open). Settle the
    // superseded promise as `false` before replacing it: simply overwriting
    // `_resolve` would strand that first caller forever, which in practice
    // leaves a form stuck in its loading/submitting state with no way out.
    _resolve?.(false);
    _state = { open: true, ...opts };
    _resolve = resolve;
    emit();
  });
}

export function resolveConfirm(value) {
  const resolve = _resolve;
  _state = { ..._state, open: false };
  _resolve = null;
  emit();
  resolve?.(value);
}