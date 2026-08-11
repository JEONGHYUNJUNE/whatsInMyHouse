import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { AuthProvider } from './contexts/AuthContext'
import { AppDialogProvider } from './contexts/AppDialogContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDialogProvider><AuthProvider><App /></AuthProvider></AppDialogProvider>
  </StrictMode>,
)
