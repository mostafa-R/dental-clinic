import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './app/store'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorDialog from './components/ErrorDialog'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
          <ErrorDialog />
        </BrowserRouter>
      </ErrorBoundary>
    </Provider>
  </StrictMode>,
)
