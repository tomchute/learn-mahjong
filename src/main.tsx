import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { registerServiceWorker } from './register-sw';
import './styles.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
