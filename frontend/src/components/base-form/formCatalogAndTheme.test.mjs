import {operationalAcceptanceRequirements, operationalAcceptanceVersion} from './operationalAcceptance.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {invalidateChangedDesignReleases,invalidatedDesignReleases} from './formDesignReleases.ts'
import {icons} from '../../navigation.ts'
import {operationalFormCatalog,catalogSchema,createOperationalRedesign,operationalSource} from './operationalFormCatalog.ts'
import {emptyDesignerDraft,createDesignerHistory,attachDesignerDocument,designerHistoryReducer} from './designer.ts'
import {createManagedLaboratoryForm,loadManagedLaboratoryForms,saveManagedLaboratoryForm,resolveManagedLaboratoryDesigner} from './laboratoryFormDraftState.ts'
import {formIntegrationTarget} from './formIntegrationTarget.ts'
import {registerTemplateRevision,templateRevisionConflicts,applyTemplateRevision} from './formTemplateInheritance.ts'
import {approveSavedDesign,savedDesignApproval,designDigest,verifyHandoffDocument,classifyRedesign,finalizeDesign,loadDesignReleases,mayActivateDesign} from './formDesignReleases.ts'
import {integratedDesignRoute} from './formIntegrationRegistry.ts'
import {laboratoryContentTitle,renameLaboratoryForm} from './formDocumentControls.ts'
import {themeTokens,defaultDesignTheme,effectiveTheme,saveThemeDraft,loadThemeDraft} from './themeDesignSystem.ts'
import {fitAutomaticEditors,fitCanvasToFields} from './formEditorViewport.ts'
import {moveToolbarPart,normalizeToolbarStyle} from './gridToolbarLayout.ts'
const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}}
const frame={device:'desktop',width:1440,height:null,fitToPage:true}
const make=(route='purchaseOrders')=>createOperationalRedesign(operationalFormCatalog.find(item=>item.route===route),'redesign.'+route,emptyDesignerDraft('form-laboratory.persons-synthetic'),frame)

test('redesigns pin the original route and contracts while new template-derived forms are independent',()=>{
 const form=make('brands'),target=formIntegrationTarget(form.schema)
 assert.equal(target.kind,'replacement');assert.equal(target.originalRoute,'brands');assert.equal(target.sourceSchemaId,'operational.brands')
 assert.equal(target.navigationAddress,'navigation.route:brands');assert.deepEqual(target.api,['/api/master-data/brands'])
 const renamed=renameLaboratoryForm(form.schema,'fa','نام دلخواه');assert.deepEqual(formIntegrationTarget(renamed),target)
 const fresh=createManagedLaboratoryForm({id:'new.independent',name:'مستقل',mode:'operational',templateSchema:form.schema,templateDesigner:emptyDesignerDraft(form.id),frame})
 assert.equal(formIntegrationTarget(fresh.schema).kind,'new')
 assert.equal(operationalSource(fresh.schema),undefined)
 const spoofed=structuredClone(form.schema);spoofed.settings.specific.values.integrationOrigin.route='persons'
 assert.equal(formIntegrationTarget(spoofed).kind,'blocked')
 const partial=make('sales');assert.equal(formIntegrationTarget(partial.schema).kind,'blocked')
 assert.equal(formIntegrationTarget(JSON.parse(JSON.stringify(form)).schema).originalRoute,'brands')
})

test('automatic content fitting retains the horizontal bounds and positions of centered rows',()=>{
 const canvas={width:900,height:600,centeredFieldIds:['a'],fields:{a:{input:{left:300,top:180,width:300,height:40},label:{left:530,top:150,width:70,height:20}}}}
 const fitted=fitCanvasToFields(canvas,['a'])
 assert.equal(fitted.width,900);assert.equal(fitted.fields.a.input.left,300)
 assert.equal(fitted.fields.a.label.left,530);assert.deepEqual(fitted.centeredFieldIds,['a'])
 assert.ok(fitted.height<canvas.height)
})

test('catalog includes every navigation route, distinguishes unimplemented routes, and has unique stable field/table IDs',()=>{
 assert.deepEqual(operationalFormCatalog.map(item=>item.route).sort(),Object.keys(icons).sort())
 for(const contract of operationalFormCatalog){const schema=catalogSchema(contract);assert.equal(new Set(schema.fields.map(field=>field.id)).size,schema.fields.length);assert.equal(new Set(schema.tables.map(table=>table.id)).size,schema.tables.length);for(const table of schema.tables){assert.equal(new Set(table.columns.map(column=>column.id)).size,table.columns.length);if(table.masterDetail)assert.ok(schema.tables.some(item=>item.id===table.masterDetail.masterTableId))}}
 assert.equal(operationalFormCatalog.find(item=>item.route==='purchases').availability,'partial')
 assert.equal(operationalFormCatalog.find(item=>item.route==='sales').availability,'placeholder')
})
test('all registered forms create independent design documents with shared appearance and no mother business geometry',()=>{
 const template={...emptyDesignerDraft('form-laboratory.persons-synthetic'),defaults:{input:{fontSize:19}},canvas:{width:900,height:600,fields:{personCode:{input:{left:500,top:300,width:100,height:40},label:{left:500,top:260,width:100,height:30}}}},overrides:{'personCode::input':{bold:true}}}
 for(const contract of operationalFormCatalog.filter(item=>item.availability!=='laboratory')){const form=createOperationalRedesign(contract,'test.'+contract.route,template,frame);assert.equal(operationalSource(form.schema).route,contract.route);assert.equal(form.id,form.schema.id);const draft=resolveManagedLaboratoryDesigner(form);assert.equal(draft.canvas,undefined);assert.equal(draft.defaults.input.fontSize,19);assert.deepEqual(draft.overrides,{})}
 assert.ok(template.canvas.fields.personCode)
})
test('brand redesign inherits the current Laboratory controls and settings without copying unrelated field geometry',()=>{
 const contract=operationalFormCatalog.find(item=>item.route==='brands')
 const actions=[['new-person','Space',[' '],'شخص جدید'],['edit-person','Insert',['Insert'],'ویرایش'],['delete-person','Delete',['Delete'],'حذف'],['first-record','Home',['Home'],'اول'],['previous-page','PgUp',['PageUp'],'صفحه قبل'],['browse-records','↑ ↓',['ArrowUp','ArrowDown'],'مرور'],['next-page','PgDn',['PageDown'],'صفحه بعد'],['last-record','End',['End'],'آخر'],['action-settings','⚙',[],'تنظیمات'],['demo-save','F3',['F3'],'ذخیره'],['reset-sample','Esc',['Escape'],'خروج']].map(([id,code,keys,label])=>({id,code,keys,label:{fa:label,en:'Lab '+label,zh:'Lab '+label},...(id==='new-person'||id==='demo-save'?{primary:true}:{}),required:['new-person','edit-person','delete-person','demo-save','reset-sample'].includes(id)}))
 const sharedSchema={id:'form-laboratory.persons-synthetic',sections:[{id:'lab.editor',kind:'editor',layout:{columns:20,gap:8},settings:{viewport:{heightMode:'fixed',overflowX:'auto'}}},{id:'lab.grid',kind:'grid'},{id:'lab.footer',kind:'footer'}],actions,tables:[{id:'lab.grid',searchable:false,columnSelection:true,rowSelection:'single',contextMenu:true,lazyLoading:true,virtualScrolling:true,settings:{toolbar:{title:{x:12,y:6},search:{x:20,y:4},searchInput:{x:28,y:8}}}}],settings:{shared:{behaviorId:'laboratory.standard'}}}
 const template={...emptyDesignerDraft(sharedSchema.id),appearance:{actionBackground:'#e1f3ee'},canvas:{width:900,height:600,fields:{personCode:{input:{left:500,top:300,width:100,height:40},label:{left:500,top:260,width:100,height:30}}}},overrides:{'personCode::input':{bold:true}},actions:{'new-person':{backgroundColor:'#123456'},'delete-person':{backgroundColor:'#c00000'}},tables:{'lab.grid':{tableFont:18,filterPopupFontSize:17,gridSearchPosition:'left',tableHeaderHeight:44}},tableColumns:{legacy:{bold:true}},tableHeaders:{legacy:{bold:true}}}
 const form=createOperationalRedesign(contract,'redesign.brands.inherited',template,frame,4,sharedSchema),draft=resolveManagedLaboratoryDesigner(form),table=form.schema.tables[0]
 const actionCodes=form.schema.actions.map(action=>action.code)
 assert.equal(form.template.version,4);assert.equal(form.schema.settings.shared.behaviorId,'laboratory.standard');assert.deepEqual(actionCodes.slice(0,actions.length),actions.map(action=>action.code));assert.equal(form.schema.actions.length,13);assert.ok(actionCodes.includes('F2')&&actionCodes.includes('F4'),'operational forms keep the shared copy-last and copy-selected actions');assert.equal(form.schema.actions.find(action=>action.id==='operational.new').label.en,'Lab شخص جدید');assert.equal(form.schema.actions.find(action=>action.id==='browse-records').label.en,'Lab مرور')
 assert.equal(form.schema.sections.find(section=>section.kind==='editor').settings.viewport.overflowX,'auto');assert.equal(form.schema.sections.find(section=>section.kind==='editor').layout.columns,20)
 assert.equal(table.searchable,false);assert.equal(table.columnSelection,true);assert.equal(table.contextMenu,true);assert.equal(table.settings.toolbar.searchInput.x,28)
 assert.equal(draft.appearance.actionBackground,'#e1f3ee');assert.equal(draft.actions['operational.new'].backgroundColor,'#123456');assert.equal(draft.actions['operational.delete'].backgroundColor,'#c00000');assert.deepEqual(draft.tables[table.id],{tableFont:18,filterPopupFontSize:17,gridSearchPosition:'left',tableHeaderHeight:44})
 assert.equal(draft.canvas,undefined);assert.deepEqual(draft.overrides,{});assert.equal(draft.tableColumns,undefined);assert.equal(draft.tableHeaders,undefined)
})
test('master publication selects source defaults and drafts independently without importing Persons schema or replacing overrides',()=>{
 const form=make();const designer={...emptyDesignerDraft(form.template.formId),defaults:{input:{fontSize:22}}};const before=JSON.stringify(form);const registered=registerTemplateRevision({version:1,activeFormId:null,forms:[form]},{schema:catalogSchema(operationalFormCatalog.find(item=>item.route==='persons')),designer,frame,createdAt:'now'},['catalog:purchaseOrders',form.id]);assert.equal(registered.catalogTemplates.purchaseOrders.version,2);assert.equal(registered.catalogTemplates.brands,undefined);assert.deepEqual(registered.forms[0].schema.fields,form.schema.fields);assert.deepEqual(registered.forms[0].schema.tables,form.schema.tables);assert.equal(JSON.stringify(form),before)
 assert.throws(()=>registerTemplateRevision({version:1,activeFormId:null,forms:[]},{schema:form.schema,designer,frame,createdAt:'now'},['catalog:not-a-route']))
})
test('visual edits and structural edits are classified from bindings, independent of order or labels',()=>{
 const form=make();assert.equal(classifyRedesign(form.schema),'appearance');const schema=structuredClone(form.schema);schema.fields.reverse();schema.fields[0].label.fa='New label';assert.equal(classifyRedesign(schema),'appearance');schema.fields.pop();assert.equal(classifyRedesign(schema),'fundamental');const type=structuredClone(form.schema);type.fields[0].kind='number';assert.equal(classifyRedesign(type),'fundamental');const behavior=structuredClone(form.schema);behavior.behaviorInstruction='New API and behavior';assert.equal(classifyRedesign(behavior),'fundamental')
})
test('finalized design versions are immutable, reloadable and cannot activate or overwrite the operational original',()=>{
 const storage=memory(),form=make();assert.equal(saveManagedLaboratoryForm(storage,'admin',form),true);const original=JSON.stringify(loadManagedLaboratoryForms(storage,'admin').forms[0]);const submitted=structuredClone(form);const first=finalizeDesign(storage,'admin',form,'release-1','2026-10-18');form.schema.fields.pop();const second=finalizeDesign(storage,'admin',form,'release-2');const versions=loadDesignReleases(storage,'admin');assert.equal(versions.length,2);assert.equal(JSON.stringify(versions[0].snapshot),JSON.stringify(submitted));assert.equal(first.change,'appearance');assert.equal(second.change,'fundamental');assert.equal(mayActivateDesign(second),false);assert.equal(JSON.stringify(loadManagedLaboratoryForms(storage,'admin').forms[0]),original);assert.equal(loadDesignReleases(storage,'other').length,0);assert.equal(finalizeDesign(storage,'admin',form,'release-1'),undefined)
})
test('theme definitions and user overrides remain separate; forbidden overrides cannot change effective appearance',()=>{
 const storage=memory(),theme=structuredClone(defaultDesignTheme);theme.userEditable=['accent'];assert.equal(saveThemeDraft(storage,[theme]),true);const personal={themeId:theme.id,colors:{accent:'#123456',background:'#ff0000'}};assert.equal(effectiveTheme(theme,personal).accent,'#123456');assert.equal(effectiveTheme(theme,personal).background,theme.colors.background);assert.equal(loadThemeDraft(storage)[0].id,theme.id);assert.equal(theme.colors.accent,defaultDesignTheme.colors.accent);assert.equal(saveThemeDraft(storage,[{...theme,colors:{...theme.colors,accent:'url(bad)'}}]),false);assert.equal(loadThemeDraft(storage)[0].colors.accent,defaultDesignTheme.colors.accent);assert.equal(themeTokens.length,7)
})

test('handoff requires the exact saved permissions-approved version and ignores unverified activation',async()=>{
 const storage=memory(),form=make()
 assert.equal(await approveSavedDesign(storage,'admin',form),false)
 assert.equal(saveManagedLaboratoryForm(storage,'admin',form),true)
 const saved=loadManagedLaboratoryForms(storage,'admin').forms[0]
 assert.equal(await savedDesignApproval(storage,'admin',saved),undefined)
 assert.equal(await approveSavedDesign(storage,'admin',saved),true)
 assert.ok(await savedDesignApproval(storage,'admin',saved))
 const changed=structuredClone(saved);changed.customization.colors=!changed.customization.colors
 assert.equal(await savedDesignApproval(storage,'admin',changed),undefined)
 const geometry=structuredClone(saved);geometry.frame.width+=1
 assert.equal(await savedDesignApproval(storage,'admin',geometry),undefined)
 assert.equal(await savedDesignApproval(storage,'other',saved),undefined)
 const document={artifact:'yarn-trade.single-form-design-export',form:saved},digest=await designDigest(document)
 const release=finalizeDesign(storage,'admin',saved,'verified-handoff',undefined,{digest,backupId:'a'.repeat(32),jsonAddress:'/api/form-design-backups/'+ 'a'.repeat(32)+'?handoff=true',permissionsConfirmedAt:'now'})
 assert.equal(await verifyHandoffDocument(document,release),true)
 assert.equal(await verifyHandoffDocument({...document,form:changed},release),false)
 assert.equal(integratedDesignRoute(release),undefined)
 const receipt={formId:saved.id,releaseId:release.id,digest,route:'purchaseOrders',replacement:{originalRoute:'purchaseOrders',sourceBaselineDigest:'a'.repeat(64),rollbackArtifact:'isolated-test-rollback.json'}}
 assert.equal(integratedDesignRoute(release,[{...receipt,replacement:undefined}]),undefined)
 assert.equal(integratedDesignRoute(release,[{...receipt,route:'brands'}]),undefined)
 assert.equal(integratedDesignRoute(release,[receipt]),undefined)
 const required=operationalAcceptanceRequirements(release.snapshot.schema)
 const passed=keys=>Object.fromEntries(keys.map(key=>[key,{status:'passed',artifact:'isolated-fixture/'+key}]))
 receipt.acceptance={version:operationalAcceptanceVersion,formId:release.formId,releaseId:release.id,digest,form:passed(required.form),tables:Object.fromEntries(required.tables.map(t=>[t.id,passed(t.checks)])),hierarchy:passed(required.hierarchy)}
 assert.equal(integratedDesignRoute(release,[receipt]),'purchaseOrders')
 const failed=structuredClone(receipt);failed.acceptance.form.permissions.status='failed'
 assert.equal(integratedDesignRoute(release,[failed]),undefined)
 assert.equal(integratedDesignRoute(release,[{...receipt,releaseId:'other'}]),undefined)
 assert.equal(integratedDesignRoute(release,[{...receipt,digest:'wrong'}]),undefined)
 assert.equal(integratedDesignRoute(release,[{...receipt,route:'sales'}]),undefined)
 assert.equal(loadDesignReleases(storage,'admin').at(-1).handoff.digest,digest)
 assert.equal(invalidateChangedDesignReleases(storage,'admin',saved),false)
 assert.equal(invalidateChangedDesignReleases(storage,'admin',geometry),true)
 assert.equal(invalidatedDesignReleases(storage,'admin')[release.id],true)
 assert.equal(invalidateChangedDesignReleases(storage,'admin',saved),false)
 assert.equal(invalidatedDesignReleases(storage,'admin')[release.id],true,'Undo cannot reapprove a changed release')
 assert.deepEqual(invalidatedDesignReleases(storage,'other'),{})
})
test('renaming a Laboratory form synchronizes its primary report without touching columns or geometry',()=>{
 const form=make(),before=JSON.stringify(form),renamed=renameLaboratoryForm(form.schema,'fa','تعریف گروه کالاها')
 assert.equal(renamed.title.fa,'تعریف گروه کالاها');assert.equal(renamed.tables[0].title.fa,'گزارش تعریف گروه کالاها')
 assert.equal(renamed.tables[0].id,form.schema.tables[0].id);assert.equal(renamed.tables[0].columns,form.schema.tables[0].columns)
 assert.equal(renamed.fields,form.schema.fields);assert.equal(renamed.sections,form.schema.sections);assert.equal(JSON.stringify(form),before)
 assert.equal(renameLaboratoryForm(renamed,'fa',renamed.title.fa),renamed)
 const staged=renameLaboratoryForm(renamed,'fa','تعریف گروه کالاها — آزمایشی')
 assert.equal(staged.title.fa,'تعریف گروه کالاها — آزمایشی');assert.equal(staged.tables[0].title.fa,'گزارش تعریف گروه کالاها')
 assert.equal(laboratoryContentTitle(staged.title.fa),'تعریف گروه کالاها')
 assert.equal(laboratoryContentTitle('روش آزمایشی تولید'),'روش آزمایشی تولید')
})
test('content fitting removes empty extents, preserves relative field geometry and persists through unified Undo',()=>{
 const canvas={width:1800,height:1200,fields:{a:{input:{left:600,top:400,width:150,height:40},label:{left:600,top:370,width:150,height:24}},b:{input:{left:800,top:400,width:150,height:40},label:{left:800,top:370,width:150,height:24}},removed:{input:{left:1600,top:1100,width:150,height:40},label:{left:1600,top:1070,width:150,height:24}}}};
 const fitted=fitCanvasToFields(canvas,['a','b']);assert.ok(fitted.width<600);assert.ok(fitted.height<140);assert.equal(fitted.fields.b.input.left-fitted.fields.a.input.left,200);assert.equal(canvas.width,1800)
 const form=make();form.schema.fields=[{...form.schema.fields[0],id:'a',sectionId:'catalog.editor'},{...form.schema.fields[1],id:'b',sectionId:'catalog.editor'}];form.schema.sections[0].settings={viewport:{heightMode:'content',overflowX:'auto',overflowY:'auto'}};const draft={...emptyDesignerDraft(form.id),canvas};const h=attachDesignerDocument(createDesignerHistory(draft),form.schema);const next=designerHistoryReducer(h,{type:'change',draft:fitAutomaticEditors(draft,form.schema),schema:form.schema});assert.ok(next.present.canvas.width<600);assert.equal(designerHistoryReducer(next,{type:'undo'}).present.canvas.width,1800)
})
test('toolbar controls keep independent positions and sizes, clamp invalid values and Undo atomically with structure',()=>{
 const toolbar=moveToolbarPart({},'title',{x:20,y:12,fontSize:12});const updated=moveToolbarPart(toolbar,'counter',{fontSize:20});assert.equal(updated.title.fontSize,12);assert.equal(updated.counter.fontSize,20);assert.deepEqual(normalizeToolbarStyle({x:Infinity,fontSize:99,width:0}),{fontSize:48,width:32});const form=make(),table=form.schema.tables[0];const schema={...form.schema,tables:form.schema.tables.map(item=>item.id===table.id?{...item,settings:{toolbar:updated}}:item)};const h=attachDesignerDocument(createDesignerHistory(emptyDesignerDraft(form.id)),form.schema),next=designerHistoryReducer(h,{type:'change',draft:h.present,schema});assert.equal(next.document.present.tables[0].settings.toolbar.counter.fontSize,20);assert.equal(designerHistoryReducer(next,{type:'undo'}).document.present.tables[0].settings,undefined)
})

test('changed field-column relations and query behavior require integration review',()=>{
 const form=make(),schema=structuredClone(form.schema)
 schema.tables[0].columns[0].sourceFieldIds=['supplierId']
 assert.equal(classifyRedesign(schema),'fundamental')
 const sort=structuredClone(form.schema);sort.tables[0].defaultSort=[{binding:sort.tables[0].columns[0].binding,direction:'desc'}]
 assert.equal(classifyRedesign(sort),'fundamental')
})

test('master conflict preview identifies and preserves form-specific decisions',()=>{
 const form=make();form.template.frame=structuredClone(frame);form.frame.width=1200
 const revision={schema:structuredClone(form.schema),designer:emptyDesignerDraft(form.template.formId),frame:{...frame,width:1600},createdAt:'now',version:2}
 assert.ok(templateRevisionConflicts(form,revision).includes('frame.width'))
 assert.equal(applyTemplateRevision(form,revision).frame.width,1200)
 assert.equal(form.frame.width,1200)
})
