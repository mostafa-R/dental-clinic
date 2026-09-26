import React from "react";

/**
 * Test-environment shim.
 *
 * Every component in this app is written for the automatic JSX runtime and none
 * of them import React. Vite 8 builds them correctly, but the Vitest transform
 * emits classic `React.createElement(...)` calls, so rendering any component in
 * a test throws "React is not defined".
 *
 * Exposing React on globalThis is the narrowest fix: it is scoped to tests, so
 * it cannot mask a missing import in application code or affect the production
 * build.
 */
globalThis.React = React;
