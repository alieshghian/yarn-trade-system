import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function checkPersonsYarnGridParity({ base, send, evaluate, until }) {
  const layouts = {}
  const output = process.env.PERSONS_PARITY_ARTIFACTS
  if (output) await mkdir(output, { recursive: true })
  for (const [name, path] of [['yarn', 'approved-yarns.html'], ['persons', 'person-brand-lookup.html?toolbar=1']]) {
    const documentTime = await evaluate('performance.timeOrigin')
    await send('Page.navigate', { url: base + '/tests/' + path })
    const grid = 'document.querySelector(".base-grid-boundary")'
    const search = grid + '?.querySelector("input[type=search]")'
    await until(`performance.timeOrigin!==${documentTime} && !!(${grid})?.querySelector('tbody [data-record-id]')`, name + ' grid rows')
    assert.ok(await evaluate('!!(' + search + ')'), name + ' shared search input')
    await evaluate(`(${grid}).querySelector('.base-grid-table-wrap').focus()`)
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 })
    await until(`document.activeElement===(${search})`, name + ' physical F1 focus')

    layouts[name] = []
    for (const [width, height] of [[1440,900],[1600,900],[1920,1080],[740,900]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      const measurement = await evaluate(`(async()=> {
        await document.fonts.ready
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
        const root = ${grid}, toolbar=root.querySelector('.grid-toolbar'), rect=toolbar.getBoundingClientRect();
        const get=(selector)=>toolbar.querySelector(selector)?.getBoundingClientRect()
        const center=r=>r.x+r.width/2
        const controls=['[data-toolbar-part=columns] summary','[data-toolbar-part=expand] button','[data-grid-tool=export] button'].map(get)
        const title=get('[data-toolbar-part=title]'), counter=get('[data-toolbar-part=counter]'), input=get('input[type=search]')
        return {
          viewport:innerWidth,
          shared:root.dataset.toolbarLayout==='laboratory'&&toolbar.dataset.toolbarContract==='2',
          modes:toolbar.querySelectorAll('[data-toolbar-part^="searchOption:"] input[type=radio]').length,
          ordered:controls.every((r,i)=>i===0||r.x>controls[i-1].x),
          sizes:controls.map(r=>[r.width,r.height]),
          titleOffset: Math.abs(center(title)-center(counter)),
          titleBetween: center(title)>controls.at(-1).right && (input.top>title.bottom || center(title)<input.left),
          visible:controls.every(r=>r.left>=rect.left-1&&r.right<=rect.right+1)&&input.right<=rect.right+1,
          filter:!!root.querySelector('.column-heading .excel-filter-trigger'),
          direction:getComputedStyle(root.querySelector('table')).direction,
          clip:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,scale:1}
        }
      })()`)
      assert.equal(measurement.viewport, width)
      assert.ok(measurement.shared && measurement.filter, name + ' shared toolbar and column-header contract')
      assert.equal(measurement.modes, 3)
      assert.ok(measurement.ordered && measurement.visible, name + ' toolbar controls remain in shared order and bounds')
      // A fractional CSS pixel can separate independently rounded center lines.
      assert.ok(measurement.titleOffset <= 1 && measurement.titleBetween, name + ' title and counter are centered in the shared lane: ' + JSON.stringify(measurement))
      assert.equal(measurement.direction, 'rtl')
      layouts[name].push(measurement)
      if (output) {
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: measurement.clip })
        await writeFile(join(output, name + '-' + width + '.png'), Buffer.from(shot.data,'base64'))
      }
    }
  }
  for (let index=0;index<layouts.yarn.length;index++) {
    for (let button=0;button<3;button++) {
      const width = layouts.persons[index].viewport
      const dimensions = layouts.persons[index].sizes[button]
      assert.ok(dimensions.every((dimension,axis)=>Math.abs(dimension-layouts.yarn[index].sizes[button][axis])<=1),
        'Yarn and Persons button sizing parity at '+width)
    }
  }
  if (output) await writeFile(join(output, 'parity-measurements.json'), JSON.stringify(layouts,null,2))
  await send('Emulation.clearDeviceMetricsOverride')
  console.log('PASS Yarn and Persons share accessible RTL toolbar geometry across four viewports')
}
