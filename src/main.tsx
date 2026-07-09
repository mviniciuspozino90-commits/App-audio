import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle Spotify OAuth Callback inside popup
if (typeof window !== 'undefined') {
  const hash = window.location.hash;
  const search = window.location.search;
  
  if (window.opener && (hash.includes('access_token=') || search.includes('error='))) {
    let token: string | null = null;
    let error: string | null = null;
    
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      token = params.get('access_token');
    } else {
      const params = new URLSearchParams(search);
      error = params.get('error');
    }
    
    if (token) {
      window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS', token }, '*');
    } else if (error) {
      window.opener.postMessage({ type: 'SPOTIFY_AUTH_ERROR', error }, '*');
    }
    
    window.close();
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
