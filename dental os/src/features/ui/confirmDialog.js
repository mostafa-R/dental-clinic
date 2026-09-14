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