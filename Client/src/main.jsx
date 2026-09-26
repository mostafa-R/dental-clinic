import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './app/store'
import { bindStore } from './app/storeBinding'
import { fetchMyPermissions } from './features/users/userSlice'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorDialog from './components/ErrorDialog'
import ToastContainer from './components/ui/ToastContainer'
import ConfirmDialog from './components/ui/ConfirmDialog'
import './index.css'
import App from './App.jsx'

// `lib/axios.js` needs the store for session-expiry teardown and permission
// refresh, but importing it from there would close an import cycle. Binding it
// here keeps axios cycle-free while still giving it a live store.
bindStore(store, { fetchMyPermissions })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
          <ToastContainer />
          <ConfirmDialog />
          <ErrorDialog />
        </BrowserRouter>
      </ErrorBoundary>
    </Provider>
  </StrictMode>,
)
