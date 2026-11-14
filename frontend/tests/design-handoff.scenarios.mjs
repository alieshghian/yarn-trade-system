export async function runDesignHandoffScenarios({base,navigatePage,evaluate,until,check}){
 await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeInline'})
 const click=async(text)=>{await until(`Array.from(document.querySelectorAll('button')).some(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)})`);await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)}).click()`)}
 await click('تنظیمات فرم')
 await evaluate(`(()=>{const input=Array.from(document.querySelectorAll('.form-document-settings label')).find(e=>e.textContent.startsWith('نام فرم')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'تعریف گروه کالاها — آزمایشی');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await until(`document.querySelector('.cascading-tree-header h2')?.textContent==='تعریف گروه کالاها'`)
 await check('form rename immediately updates the actual tree heading and standard report title',`Array.from(document.querySelectorAll('.person-grid-panel')).some(e=>e.textContent.includes('گزارش تعریف گروه کالاها'))`)
 await check('menu registration remains hidden until the exact design is saved',`!Array.from(document.querySelectorAll('[data-design-save-actions] button')).some(b=>b.textContent.includes('ثبت اتصال'))`)
 await click('تأیید و ذخیرهٔ فرم')
 await until(`document.body.textContent.includes('تأیید مجوزها و ذخیره')`)
 await check('unsaved/unapproved form cannot enter integration queue',`!document.querySelector('.pending-form-design-menu')`)
 await click('تأیید مجوزها و ذخیره')
 await until(`!Array.from(document.querySelectorAll('[role="dialog"]')).some(e=>e.textContent.includes('تأیید مجوزها و ذخیره'))`)
 await evaluate(`(async()=>{const {loadManagedLaboratoryForms}=await import('/src/components/base-form/laboratoryFormDraftState.ts');const {finalizeDesign}=await import('/src/components/base-form/formDesignReleases.ts');const form=loadManagedLaboratoryForms(localStorage,'isolated-browser-regression').forms.find(f=>f.id==='form.tree-geometry');finalizeDesign(localStorage,'isolated-browser-regression',form,'legacy-unapproved-release');window.dispatchEvent(new Event('form-design-releases-updated'))})()`)
 await check('successful save prepares complete verified JSON before menu registration',`window.testServerBackupVersions.some(v=>v.document.reason==='integration-handoff'&&v.document.snapshot.behaviorManifest&&v.document.snapshot.form.customization)&&!document.querySelector('.pending-form-design-menu button[data-handoff-json]')`)
 await check('legacy queue entry without approval and verified handoff remains hidden even after saving',`!document.querySelector('.pending-form-design-menu')`)
 await check('save and menu registration share the same action row',`(()=>{const row=document.querySelector('[data-design-save-actions]');return row&&row.querySelectorAll('button').length===2&&Array.from(row.querySelectorAll('button')).some(b=>b.textContent==='تأیید و ذخیرهٔ فرم')})()`)
 await evaluate(`window.preparedHandoffCount=window.testServerBackupVersions.filter(v=>v.document.reason==='integration-handoff').length`)
 await click('ثبت اتصال به منو')
 await until(`!!document.querySelector('.pending-form-design-menu button[data-handoff-json]')`)
 await check('menu displays only form name with nonvisual handoff metadata',`(()=>{const b=document.querySelector('.pending-form-design-menu button[data-handoff-json]');return b.textContent.trim()==='تعریف گروه کالاها — آزمایشی، در انتظار اتصال'&&b.closest('[data-nav-id]')?.dataset.navId==='formLaboratory'&&b.dataset.releaseId&&b.dataset.handoffDigest.length===64&&!document.querySelector('.form-handoff-tools')})()`)
 await check('registration reuses prepared JSON and hides its button',`window.testServerBackupVersions.filter(v=>v.document.reason==='integration-handoff').length===window.preparedHandoffCount&&!Array.from(document.querySelectorAll('[data-design-save-actions] button')).some(b=>b.textContent==='ثبت اتصال به منو')`)
 await check('pending form name is yellow in the actual sidebar',`getComputedStyle(document.querySelector('.pending-form-design-menu button[data-design-status="awaiting-integration"]')).color==='rgb(255, 224, 130)'`)
 await evaluate(`(async()=>{const b=document.querySelector('.pending-form-design-menu button[data-handoff-json]');const doc=await fetch(b.dataset.handoffJson).then(r=>r.json());const {verifyHandoffDocument,loadDesignReleases}=await import('/src/components/base-form/formDesignReleases.ts');window.handoffMetadataVerified=await verifyHandoffDocument(doc,loadDesignReleases(localStorage,'isolated-browser-regression').at(-1));window.handoffDownloaded=doc})()`)
 await until(`!!window.handoffDownloaded`)
 await check('nonvisual address retrieves verified complete JSON with permissions and behavior',`window.handoffMetadataVerified&&window.handoffDownloaded.integrationHandoff.operationalTitle.fa==='تعریف گروه کالاها'&&window.handoffDownloaded.form.customization&&window.handoffDownloaded.behaviorManifest&&window.handoffDownloaded.form.schema.tables[0].columns.length===6`)
 await evaluate(`(()=>{const input=Array.from(document.querySelectorAll('.form-document-settings label')).find(e=>e.textContent.startsWith('نام فرم')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'تعریف گروه کالاها ویرایش');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await until(`!!document.querySelector('.pending-form-design-menu button[data-design-status="changed"]')`)
 await check('editing a finalized form immediately turns its menu red and removes usable handoff address',`(()=>{const b=document.querySelector('.pending-form-design-menu button[data-design-status="changed"]');b.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}));return !b.dataset.handoffJson&&getComputedStyle(b).color==='rgb(255, 138, 128)'})()`)
 await until(`!!document.querySelector('.pending-form-design-context-menu')`)
 await check('integration context command is disabled for changed release',`Array.from(document.querySelectorAll('.pending-form-design-context-menu button')).find(b=>b.textContent.includes('API')).disabled`)
 await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const input=Array.from(document.querySelectorAll('.form-document-settings label')).find(e=>e.textContent.startsWith('نام فرم')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'تعریف گروه کالاها — آزمایشی');input.dispatchEvent(new Event('input',{bubbles:true}))`)
 await check('menu registration remains hidden until the exact design is saved',`!Array.from(document.querySelectorAll('[data-design-save-actions] button')).some(b=>b.textContent.includes('ثبت اتصال'))`)
 await click('تأیید و ذخیرهٔ فرم')
 await until(`document.body.textContent.includes('تأیید مجوزها و ذخیره')`)
 await check('reverting changes does not silently restore integration approval',`!!document.querySelector('.pending-form-design-menu button[data-design-status="changed"]')`)
 await click('تأیید مجوزها و ذخیره')
 await until(`!Array.from(document.querySelectorAll('[role="dialog"]')).some(e=>e.textContent.includes('تأیید مجوزها و ذخیره'))`)
 await click('ثبت اتصال به منو')
 await until(`!!document.querySelector('.pending-form-design-menu button[data-handoff-json]')`)
 await check('reapproval publishes a yellow release of the latest form',`!document.querySelector('.pending-form-design-menu button[data-design-status="changed"]')`)
 await evaluate(`window.confirm=()=>true;document.querySelector('.pending-form-design-menu button[data-handoff-json]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}))`)
 await until(`!!document.querySelector('.pending-form-design-context-menu')`)
 await evaluate(`Array.from(document.querySelectorAll('.pending-form-design-context-menu button')).find(b=>b.textContent.includes('API')).click()`)
 await until(`window.testServerBackupVersions.some(v=>v.document.reason==='integration-request')`)
 await check('context confirmation records the exact handoff request without falsely activating the form',`(()=>{const r=window.testServerBackupVersions.find(v=>v.document.reason==='integration-request').document;const b=document.querySelector('.pending-form-design-menu button[data-handoff-json]');return r.releaseId===b.dataset.releaseId&&r.digest===b.dataset.handoffDigest&&b.dataset.designStatus==='awaiting-integration'&&r.snapshot.status==='awaiting-developer-integration'})()`)

 await navigatePage({url:base+'/tests/form-designer.html?treeGeometry&treeInline'})
 await until(`!!document.querySelector('.pending-form-design-menu button[data-handoff-json]')`)
 await check('saved names and handoff survive reopen in isolated storage',`document.querySelector('.cascading-tree-header h2')?.textContent==='تعریف گروه کالاها'&&!!document.querySelector('.pending-form-design-menu button[data-handoff-json]').dataset.handoffJson`)
 if(process.env.FORM_TEST_DESIGN_SAVE_GATE_ONLY==='1'){
  await click('تنظیمات فرم')
  await check('reopening even an approved saved design hides menu registration until a new successful save',`document.querySelectorAll('[data-design-save-actions] button').length===1`)
  await click('تأیید و ذخیرهٔ فرم')
  await click('تأیید مجوزها و ذخیره')
  await until(`document.querySelectorAll('[data-design-save-actions] button').length===2`)
  await check('fresh successful save enables registration again',`Array.from(document.querySelectorAll('[data-design-save-actions] button')).some(b=>b.textContent==='ثبت اتصال به منو')`)
  await click('تأیید و ذخیرهٔ فرم')
  await evaluate(`(()=>{const original=window.fetch;window.restoreHandoffFetch=()=>{window.fetch=original};window.fetch=(input,init)=>{if(init?.body&&typeof init.body==='string'&&JSON.parse(init.body).reason==='integration-handoff')return Promise.reject(Error('isolated handoff failure'));return original(input,init)}})()`)
  await click('تأیید مجوزها و ذخیره')
  await until(`document.body.textContent.includes('تحویل تأیید نشد')`)
  await check('failed complete-JSON preparation never exposes menu registration',`!Array.from(document.querySelectorAll('[data-design-save-actions] button')).some(b=>b.textContent==='ثبت اتصال به منو')`)
  await evaluate(`window.restoreHandoffFetch()`)
  return
 }
 await evaluate(`(async()=>{const {loadDesignReleases}=await import('/src/components/base-form/formDesignReleases.ts');const {operationalAcceptanceRequirements}=await import('/src/components/base-form/operationalAcceptance.ts');const release=loadDesignReleases(localStorage,'isolated-browser-regression').at(-1);const receipt={formId:release.formId,releaseId:release.id,digest:release.handoff.digest,route:'brands'};if(window.testIntegratedDesignRoute(release,[receipt]))throw Error('Missing acceptance must block deployment');const required=operationalAcceptanceRequirements(release.snapshot.schema),checks=keys=>Object.fromEntries(keys.map(key=>[key,{status:'passed',artifact:'isolated-browser-fixture'}]));window.testDeploymentReceipt({...receipt,acceptance:{version:required.version,formId:release.formId,releaseId:release.id,digest:release.handoff.digest,form:checks(required.form),tables:Object.fromEntries(required.tables.map(table=>[table.id,checks(table.checks)])),hierarchy:checks(required.hierarchy)}});if(window.testIntegratedDesignRoute(release)!=='brands')throw Error('Deployment receipt mismatch')})()`)
 await until(`!document.querySelector('.pending-form-design-menu')`)
 await check('deployed exact release disappears from queue and empty waiting heading is removed',`!document.body.textContent.includes('نسخه‌های طراحی — در انتظار اتصال')&&!!document.querySelector('[data-nav-id]')`)
 await evaluate(`(async()=>{
 const {createOperationalRedesign,operationalFormCatalog}=await import('/src/components/base-form/operationalFormCatalog.ts');
 const {emptyDesignerDraft}=await import('/src/components/base-form/designer.ts');
 const {saveManagedLaboratoryForm,loadManagedLaboratoryForms,resolveManagedLaboratoryDesigner,createManagedFormStructureHistory}=await import('/src/components/base-form/laboratoryFormDraftState.ts');
 const {approveSavedDesign,savedDesignApproval,designDigest,finalizeDesign}=await import('/src/components/base-form/formDesignReleases.ts');
 const {createFormDesignExport}=await import('/src/components/base-form/formDesignExport.ts');
 const owner='isolated-browser-regression',id='isolated.brand-replacement';const form=createOperationalRedesign(operationalFormCatalog.find(c=>c.route==='brands'),id,emptyDesignerDraft('form-laboratory.persons-synthetic'),{device:'desktop',width:1100,height:800,fitToPage:false});
 if(!saveManagedLaboratoryForm(localStorage,owner,form))throw Error('Save failed');const saved=loadManagedLaboratoryForms(localStorage,owner).forms.find(f=>f.id===id);await approveSavedDesign(localStorage,owner,saved);const approval=await savedDesignApproval(localStorage,owner,saved);
 const snapshot={form:saved,designerHistory:{present:resolveManagedLaboratoryDesigner(saved),past:[],future:[]},structureHistory:createManagedFormStructureHistory(saved.schema)};
 const {initialFormBehaviors}=await import('/src/components/base-form/formBehavior.ts');const {default:contract}=await import('/src/components/base-form/laboratoryOperationalBehavior.json');const output=createFormDesignExport(snapshot,initialFormBehaviors(),contract,location.href);const digest=await designDigest(output);const response=await fetch('/api/form-design-backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:id,reason:'integration-handoff',snapshot:output})}).then(r=>r.json());finalizeDesign(localStorage,owner,saved,'isolated-replacement-release',undefined,{digest,backupId:response.id,jsonAddress:'/api/form-design-backups/'+response.id+'?handoff=true',permissionsConfirmedAt:approval.confirmedAt});window.dispatchEvent(new Event('form-design-releases-updated'));
 })()`)
 await until(`!!document.querySelector('[data-form-id="isolated.brand-replacement"]')`)
 await evaluate(`document.querySelector('[data-form-id="isolated.brand-replacement"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:220,clientY:220}))`)
 await until(`Array.from(document.querySelectorAll('.pending-form-design-context-menu button')).some(b=>b.textContent==='درخواست جایگزینی فرم اصلی')`)
 await check('redesign context menu targets replacement rather than a new form connection',`!Array.from(document.querySelectorAll('.pending-form-design-context-menu button')).some(b=>b.textContent==='درخواست اتصال API و دیتابیس')`)
 await evaluate(`window.confirm=()=>true;Array.from(document.querySelectorAll('.pending-form-design-context-menu button')).find(b=>b.textContent==='درخواست جایگزینی فرم اصلی').click()`)
 await until(`window.testServerBackupVersions.some(v=>v.document.snapshot?.operation==='replace-existing')`)
 await check('replacement request pins original route, baseline digest and rollback requirement without activating it',`(()=>{const r=window.testServerBackupVersions.find(v=>v.document.snapshot?.operation==='replace-existing').document.snapshot;return r.integrationTarget.originalRoute==='brands'&&r.integrationTarget.rollbackRequired===true&&r.sourceBaselineDigest.length===64&&document.querySelector('[data-form-id="isolated.brand-replacement"]').dataset.designStatus==='awaiting-integration'})()`)
}
