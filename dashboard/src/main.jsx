import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { store } from "./app/store";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Apply the saved theme before first paint to avoid a light-mode flash
if (localStorage.getItem("theme") === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

function Root() {
  const { language, theme } = useSelector((state) => state.ui);

  useEffect(() => {
    // Set RTL direction based on language
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    // Keep the root .dark class in sync with the theme setting
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
