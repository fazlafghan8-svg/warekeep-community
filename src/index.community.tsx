import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalRendererLogging } from './services/installGlobalRendererLogging';
import './index.css';
installGlobalRendererLogging('main-app');
const rootElement = document.getElementById('root');
if (!rootElement)
    throw new Error('Community app root is missing.');
ReactDOM.createRoot(rootElement).render(<React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>);
