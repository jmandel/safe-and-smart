import React from 'react';
import {createRoot} from 'react-dom/client';
import {Authoring} from './Authoring';
import './styles.css';

// /author — browser-only authoring: write TSX, compile in-browser (TypeScript),
// and run the self-contained hash-addressed artifact in the same locked sandbox.
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
createRoot(container).render(<Authoring />);
