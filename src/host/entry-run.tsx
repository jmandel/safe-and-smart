import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

// /run — the wrapper runtime against the open FHIR demo endpoint. The applet to
// run is the default bundle, or ?applet=<url> / the picker. (No SMART login.)
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
createRoot(container).render(<App />);
