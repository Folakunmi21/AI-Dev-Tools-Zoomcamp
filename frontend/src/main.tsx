import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { createService } from './services'
import { ServiceProvider } from './state/service-context'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element.')

// One real API service instance for the whole app.
const service = createService()

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ServiceProvider service={service}>
        <App />
      </ServiceProvider>
    </BrowserRouter>
  </StrictMode>,
)
