import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function capturePersonsGrid({ send, evaluate }) {
  // The snapshot covers stable surfaces and borders. Geometry and typography
  // are asserted separately so OS glyph rasterization does not bias the diff.
  const clip = await evaluate(`(async () => {
    const table = document.querySelector('.active .persons-page .person-table');
    await document.fonts.ready;
    const style = document.createElement('style');
    style.id = 'persons-grid-capture-mask';
    style.textContent = '.person-table *, .person-table :is(th,td) { color: transparent !important; text-shadow: none !important; } .person-table svg { visibility: hidden; }';
    document.head.append(style);
    await new Promise(requestAnimationFrame);
    const header = table.querySelector('th').getBoundingClientRect();
    return { x: Math.floor(header.right) - 700, y: Math.ceil(header.top), width: 700, height: 62, scale: 1 };
  })()`)
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip })
    return Buffer.from(data, 'base64')
  } finally {
    await evaluate("document.getElementById('persons-grid-capture-mask').remove()")
  }
}

export async function checkPersonsGoldenVisual({ send, evaluate }) {
  const actual = await capturePersonsGrid({ send, evaluate })
  const expected = await readFile(new URL('./persons-golden-grid.png', import.meta.url))
  const urls = [expected, actual].map(image => 'data:image/png;base64,' + image.toString('base64'))
  const diff = await evaluate(`(async () => {
    const images = await Promise.all(${JSON.stringify(urls)}.map(async url => createImageBitmap(await (await fetch(url)).blob())));
    const [expected, actual] = images;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = expected.width;
    canvas.height = expected.height;
    if (actual.width !== canvas.width || actual.height !== canvas.height) throw Error('Persons screenshot size changed');
    const pixels = images.map(image => {
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    });
    let changed = 0;
    for (let i = 0; i < pixels[0].data.length; i += 4) {
      const a = pixels[0].data;
      const b = pixels[1].data;
      const differs = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i+1] - b[i+1]), Math.abs(a[i+2] - b[i+2])) > 12;
      if (differs) { changed++; b.set([255, 0, 100, 255], i); }
      else for (let channel = 0; channel < 3; channel++) b[i+channel] = 230 + Math.round(a[i+channel] / 12);
    }
    context.putImageData(pixels[1], 0, 0);
    return { changed, ratio: changed / (canvas.width * canvas.height), png: canvas.toDataURL('image/png').split(',')[1] };
  })()`)
  if (diff.ratio > 0.005) {
    const folder = join('test-results', 'persons-visual')
    await mkdir(folder, { recursive: true })
    await Promise.all([
      writeFile(join(folder, 'expected.png'), expected),
      writeFile(join(folder, 'actual.png'), actual),
      writeFile(join(folder, 'diff.png'), Buffer.from(diff.png, 'base64')),
    ])
  }
  assert.ok(diff.ratio <= 0.005, `Golden Persons grid visual diff: ${diff.changed} pixels (${(diff.ratio * 100).toFixed(2)}%). See test-results/persons-visual.`)
}
