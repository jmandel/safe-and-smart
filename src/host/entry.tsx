import React from 'react';
import {createRoot} from 'react-dom/client';
import {Landing} from './Landing';
import './styles.css';

// index.html — the explanatory landing page. Distinct paths boot the wrapper:
// /run (open-endpoint demo) and /fhir (SMART standalone launch).
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
createRoot(container).render(<Landing />);
