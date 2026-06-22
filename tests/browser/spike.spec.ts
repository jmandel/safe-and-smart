import {expect, test} from '@playwright/test';

test('renders a rich React applet while blocking ambient browser authority', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Growth Explorer'})).toBeVisible();
  await expect(page.getByText('Applet isolation checks passed')).toBeVisible();
  await expect(page.getByText('Direct DOM')).toBeVisible();
  await expect(page.getByText('Direct network')).toBeVisible();
  await expect(page.getByText('Persistent storage')).toBeVisible();
  await expect(page.locator('.remote-chart canvas')).toHaveCount(1);

  await page.getByRole('button', {name: 'Summarize longitudinal trend'}).click();
  await expect(page.getByText('Synthetic model response')).toBeVisible();
  await expect(page.getByText(/fhir\.request/).first()).toBeVisible();
  await expect(page.getByText(/llm\.complete/).first()).toBeVisible();
});
