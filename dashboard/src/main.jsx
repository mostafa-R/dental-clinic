import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { store } from "./app/store";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

function Root() {
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    // Set RTL direction based on language
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

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
