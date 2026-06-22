// W2 acceptance applet: a custom SVG care-pathway diagram. The applet supplies SVG
// markup via the ui-svg element; the host parses + validates it against the safe
// subset (shapes/text/gradients/internal refs only) and re-serializes before
// rendering. No raw author markup ever reaches the DOM.
import {runApplet, type AppletProps} from '../runtime';
import {Stack, Heading, Text, Svg} from '../remote-elements';

const DIAGRAM = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120" width="100%">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#22c55e"/>
    </linearGradient>
  </defs>
  <line x1="60" y1="60" x2="360" y2="60" stroke="url(#g)" stroke-width="6" stroke-linecap="round"/>
  <g>
    <circle cx="60" cy="60" r="22" fill="#0ea5e9"/>
    <text x="60" y="64" text-anchor="middle" fill="#fff" font-size="11">Intake</text>
  </g>
  <g>
    <circle cx="210" cy="60" r="22" fill="#14b8a6"/>
    <text x="210" y="64" text-anchor="middle" fill="#fff" font-size="11">Review</text>
  </g>
  <g>
    <circle cx="360" cy="60" r="22" fill="#22c55e"/>
    <text x="360" y="64" text-anchor="middle" fill="#fff" font-size="11">Plan</text>
  </g>
</svg>`;

function CareplanDiagram({context}: AppletProps) {
  return (
    <Stack gap={12}>
      <Heading level={2}>Care pathway</Heading>
      <Text tone="muted">Patient: {context.patient.display} — rendered from validated author SVG.</Text>
      <Svg markup={DIAGRAM} ariaLabel="Care pathway: intake, review, plan" />
    </Stack>
  );
}

runApplet(CareplanDiagram, {
  appletId: 'org.example.careplan-diagram',
  appletVersion: '0.1.0',
});
