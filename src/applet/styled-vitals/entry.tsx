/** @jsxImportSource ../safe-react */
// W1 acceptance applet: a responsive, animated layout authored with real CSS —
// installed via clinical.registerStylesheet (validated host-side: no url()/scheme/
// @import) and applied through ui-box/ui-inline className + validated inline style.
// Uses @media, @keyframes, grid, and gradients — the literal Phase-3 gate. Note:
// only ui-* elements exist (no raw <div>), so styling rides on className/style.
import {useEffect, useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {Box, Inline, Stack, Heading} from '../remote-elements';

const STYLES = `
.dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; }
.tile { display: block; padding: 18px; border-radius: 16px; color: #fff;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  box-shadow: 0 10px 26px rgba(2, 132, 199, .28);
  animation: rise .5s cubic-bezier(.2,.8,.2,1) both; }
.tile.warn { background: linear-gradient(135deg, #f59e0b, #ef4444); }
.th { display: block; font-size: 12px; letter-spacing: .07em; text-transform: uppercase; opacity: .85; }
.v { display: block; font-size: 30px; font-weight: 800; margin-top: 6px; }
.u { display: block; font-size: 13px; opacity: .8; }
.live { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(34,197,94,.6); }
  70% { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
@media (max-width: 460px) { .dash { grid-template-columns: 1fr; } }
`;

const TILES = [
  {label: 'Heart rate', value: '72', unit: 'bpm'},
  {label: 'Blood pressure', value: '118/76', unit: 'mmHg'},
  {label: 'SpO2', value: '98', unit: '%'},
  {label: 'Temp', value: '38.4', unit: 'C', warn: true},
];

function StyledVitals({context, clinical}: AppletProps) {
  const [styled, setStyled] = useState(false);
  useEffect(() => {
    clinical.registerStylesheet({css: STYLES}).then((r) => setStyled(r.ok));
  }, [clinical]);

  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <Heading level={2}>Vitals — {context.patient.display}</Heading>
        <Inline className="live">
          <Inline className="dot" /> {styled ? 'live · CSS installed' : 'installing styles…'}
        </Inline>
      </Stack>
      <Box className="dash">
        {TILES.map((t, i) => (
          <Box
            key={t.label}
            className={t.warn ? 'tile warn' : 'tile'}
            style={{animationDelay: `${i * 0.08}s`}}
          >
            <Inline className="th">{t.label}</Inline>
            <Box className="v">{t.value}</Box>
            <Box className="u">{t.unit}</Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

runApplet(StyledVitals, {appletId: 'org.example.styled-vitals', appletVersion: '0.1.0'});
