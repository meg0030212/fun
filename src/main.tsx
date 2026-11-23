import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import App from './App';
import { initSync } from './sync/engine';

void initSync();

createRoot(document.getElementById('root')!).render(<App />);
