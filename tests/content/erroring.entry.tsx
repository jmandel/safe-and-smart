// Test fixture (NOT a demo): an applet that throws during render. The content
// smoke harness loads it to verify the worker-side error boundary surfaces a
// visible error component in the wrapper instead of leaving a silent blank
// surface — i.e. that errors bubble up nicely before we rely on it.
import {runApplet, type AppletProps} from '../../src/applet/runtime';
import {Stack, Heading} from '../../src/applet/remote-elements';

const BOOM = 'intentional render failure for the error-bubbling test';

function Erroring(_props: AppletProps) {
  throw new Error(BOOM);
  // eslint-disable-next-line no-unreachable
  return (
    <Stack>
      <Heading level={2}>unreachable</Heading>
    </Stack>
  );
}

runApplet(Erroring, {appletId: 'test.erroring', appletVersion: '0'});
