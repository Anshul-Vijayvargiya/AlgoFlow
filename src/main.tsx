import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startTheme } from './store/useThemeStore'
import { startThemeAccountSync } from './theme/themeAccountSync'

// keeps <html data-theme> in sync with the saved preference (and the OS while it is 'system'); theme-init.js set it first
startTheme()
// saves explicit changes to the signed-in account; seeds devices with no choice of their own from it
startThemeAccountSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
