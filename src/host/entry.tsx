import React from 'react';
import {createRoot} from 'react-dom/client';
import {Landing} from './Landing';
import {boot} from './boot';
import {isSmartMode} from './smart-launch';
import './styles.css';

// Single page, clean URLs. Bare `/` shows the explanatory landing; a deep link
// (?fhir=smart, ?applet=…, ?run=…) boots the wrapper runtime. The routing lives
// here only — the wrapper (App) and its boot stay free of it.
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
const root = createRoot(container);

const params = new URLSearchParams(window.location.search);
if (isSmartMode() || params.has('applet') || params.has('run')) {
  boot(root);
} else {
  root.render(<Landing />);
}
