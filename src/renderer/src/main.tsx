import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const Root = (
  <HashRouter>
    <App />
  </HashRouter>
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  import.meta.env.DEV ? <React.StrictMode>{Root}</React.StrictMode> : Root
)
