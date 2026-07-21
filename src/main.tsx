import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './lib/auth-context';
import { ConfirmProvider } from './lib/confirm-context';
import { OrgProvider } from './lib/org-context';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
