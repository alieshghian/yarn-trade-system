import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { installFormInteraction } from './formInteraction'

const removeFormInteraction = installFormInteraction()
if (import.meta.hot) import.meta.hot.dispose(removeFormInteraction)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
