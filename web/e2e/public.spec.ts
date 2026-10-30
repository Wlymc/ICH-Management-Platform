import { expect, test } from '@playwright/test';

test('home page and AI assistant are interactive', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '遗脉 · 非遗数字展馆' })).toBeVisible();
  await expect(page.locator('.hero-stats > div')).toHaveCount(2);
  await expect(page.locator('.hero-stats')).not.toContainText('传承基地');
  await expect(page.locator('.hero-stats')).not.toContainText('多媒体档案');
  await page.getByRole('button', { name: '问小遗' }).click();
  await expect(page.locator('.react-ai-fab .ai-input')).toBeVisible();
});

test('home hero uses a muted looping video background', async ({ page }) => {
  await page.goto('./');
  const video = page.locator('.hero-video-layer video');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('loop', true);
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
});

test('home hero video pauses for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const video = page.locator('.hero-video-layer video');
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(true);
});

test('home links to the complete filterable model gallery', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('三维数字器物馆', { exact: true })).toBeVisible();
  await expect(page.locator('.model-entry-strip model-viewer')).toHaveCount(0);
  await page.getByRole('link', { name: /浏览全部三维器物/ }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.getByRole('heading', { name: '三维器物馆' })).toBeVisible();
  await expect(page.locator('.model-project-catalog .model-catalog-card')).toHaveCount(15);
  await expect(page.locator('.model-gallery-feature model-viewer')).toHaveAttribute(
    'src',
    /\/models3d\//,
  );
  await expect
    .poll(() =>
      page
        .locator('.model-gallery-feature model-viewer')
        .evaluate((viewer) => Boolean(viewer.loaded)),
    )
    .toBe(true);

  await expect(page.locator('.model-story-chapter')).toHaveCount(4);
  await expect(page.locator('.model-museum-info h2')).toHaveText('明永乐青花穿莲龙纹天球瓶');
  await page.getByRole('button', { name: /古法制瓷工序/ }).click();
  await expect(page.locator('.model-museum-info h2')).toHaveText('陶瓷碗器形参考');
  await expect(page.locator('.model-museum-story')).toContainText('古法制瓷工序');
  await expect(page.locator('.model-gallery-feature model-viewer')).toHaveAttribute(
    'src',
    /bowl\.glb/,
  );

  await page.getByLabel('按非遗门类筛选').selectOption('7');
  await expect(page.locator('.model-gallery-library-head p')).toContainText('2 个项目');
  await expect(page.locator('.model-gallery-library-head p')).toContainText('2 个模型');
  await expect(page.locator('.model-project-catalog .model-catalog-card')).toHaveCount(2);
  await page
    .locator('.model-project-catalog')
    .getByRole('button', { name: /中式木雕造像/ })
    .click();
  await expect(page.locator('.model-museum-project')).toHaveText('东阳木雕');
  await expect(page.locator('.model-museum-info h2')).toHaveText('中式木雕造像');
  await expect(page.locator('.model-gallery-feature model-viewer')).toHaveAttribute(
    'src',
    /chinese_wooden_sculpture/,
  );
});

test('project filters update the URL and result count', async ({ page }) => {
  await page.goto('projects');
  await page.getByLabel('非遗类别').selectOption('8');
  await expect(page).toHaveURL(/category_id=8/);
  await expect(page.locator('.list-summary strong')).not.toHaveText('157');
});

test('project list filters by 3D availability', async ({ page }) => {
  await page.goto('projects');
  await page.getByLabel('3D模型').selectOption('1');
  await expect(page).toHaveURL(/has_3d=1/);
  await expect(page.locator('.list-summary strong')).toHaveText('8');
  await expect(page.locator('.card-project')).toHaveCount(8);
  await expect(page.locator('.card-project .card-meta')).toContainText(['3D 模型']);

  await page.getByLabel('3D模型').selectOption('0');
  await expect(page).toHaveURL(/has_3d=0/);
  await expect(page.locator('.card-project')).toHaveCount(12);
  await expect(page.locator('.card-project').first()).not.toContainText('3D 模型');
});

test('project detail renders narration and 3D controls', async ({ page }) => {
  await page.goto('projects/169');
  await expect(page.getByRole('heading', { name: '景德镇手工制瓷技艺' })).toBeVisible();
  await expect(page.getByText('走近器物的空间与细节')).toBeVisible();
  await expect(page.getByRole('button', { name: '加载三维模型' })).toBeVisible();
});

test('explore page renders an interactive star map', async ({ page }) => {
  await page.goto('explore');
  await expect(page.getByRole('heading', { name: '从一方水土，读懂一门手艺' })).toBeVisible();
  await expect(page.getByRole('img', { name: /地域星图/ })).toBeVisible();
  await expect(page.locator('.star-hub').first()).toBeVisible();
  await expect(page.locator('.protection-ring').first()).toBeVisible();

  const closeDrawer = page.locator('.explore-detail-close');
  if (await closeDrawer.isVisible()) await closeDrawer.click();
  const node = page.locator('.star-entity').last();
  const label = (await node.locator('title').textContent())?.split(' · ')[0] || '';
  await page.locator('.entity-hit').last().click();
  await expect(page.locator('.explore-drawer-head h2')).toHaveText(label);
  await expect(page.getByText('项目摘要').first()).toBeVisible();
});

test('visit guide groups official clues by province', async ({ page }) => {
  await page.goto('organizations');
  await expect(page.getByRole('heading', { name: '探访线索', exact: true })).toBeVisible();
  await expect(page.locator('.card-visit').first()).toBeVisible();
  await expect(page.getByText('关于本栏目')).toBeVisible();
});

test('inheritor list preserves the seal-and-archive card design without placeholder photos', async ({
  page,
}) => {
  await page.goto('inheritors');
  const firstCard = page.locator('.card-person').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('.person-seal')).toBeVisible();
  await expect(firstCard.locator('img')).toHaveCount(0);
});

test('AI assistant opens on every main public page', async ({ page }) => {
  for (const path of [
    'projects',
    'inheritors',
    'explore',
    'models',
    'organizations',
    'projects/169',
  ]) {
    await page.goto(path);
    await page.getByRole('button', { name: '问小遗' }).click();
    await expect(page.locator('.react-ai-fab .ai-input')).toBeVisible();
  }
});

test('project and inheritor details deep-link to the corresponding star map node', async ({
  page,
}) => {
  await page.goto('projects/169');
  await page.getByRole('link', { name: '打开星图' }).click();
  await expect(page).toHaveURL(/lens=project.*project=169|project=169.*lens=project/);
  await expect(page.locator('.explore-drawer-head h2')).toHaveText('景德镇手工制瓷技艺');

  await page.goto('inheritors/41');
  await page.getByRole('link', { name: /查看关系谱系/ }).click();
  await expect(page).toHaveURL(/lens=person/);
  await expect(page).toHaveURL(/inheritor=41/);
  await expect(page.locator('.explore-drawer-head h2')).toHaveText('王安江');
});

test('direct project pages provide metadata and an accessible parent-page back button', async ({
  page,
}) => {
  await page.goto('projects/169');
  await expect(page).toHaveTitle('景德镇手工制瓷技艺 · 非遗档案 · 非遗数字管理平台');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /景德镇/);
  await page.getByRole('button', { name: /返回/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
