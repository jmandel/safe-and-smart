import React from 'react';
import {createRoot} from 'react-dom/client';
import {Landing} from './Landing';
import './styles.css';

// index.html is the explanatory landing page only. The trusted wrapper runtime is
// a separate entry (app.html) so it stays free of landing/routing concerns.
const container = document.getElementById('root');
if (!container) throw new Error('Landing root element is missing.');
createRoot(container).render(<Landing />);
