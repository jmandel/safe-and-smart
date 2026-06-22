import {createRoot} from 'react-dom/client';
import {bootSmart} from './boot';
import './styles.css';

// /fhir — the wrapper runtime behind a real SMART standalone launch. This path is
// also the OAuth redirect target; on return, fhirclient consumes ?code&state.
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
bootSmart(createRoot(container));
