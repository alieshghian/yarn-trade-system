// Exercise save/reapprove/menu registration without attempting route activation.
process.env.FORM_TEST_DESIGN_SAVE_GATE_ONLY='1'
await import('./design-handoff.browser.mjs')
