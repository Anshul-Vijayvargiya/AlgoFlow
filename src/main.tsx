import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startTheme } from './store/useThemeStore'
import { startThemeAccountSync } from './theme/themeAccountSync'
import { startVisualizerActivityTracking } from './progress/visualizerActivity'
import { startPreferenceSync } from './settings/preferenceSync'

// keeps <html data-theme> in sync with the saved preference (and the OS while it is 'system'); theme-init.js set it first
startTheme()
// saves explicit changes to the signed-in account; seeds devices with no choice of their own from it
startThemeAccountSync()
// records the signed-in user's visualizer walkthroughs as learning activity (never completion)
startVisualizerActivityTracking()
// the account's preferred programming language is where the visualizer, Playground and Practice start
startPreferenceSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
