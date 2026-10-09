import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, apiRequest, withRowVersion } from './api'
import { businessContractText, type Language } from './i18n'
import SystemDateInput from './SystemDateInput'
import { localTodayIso } from './dateCalendar'
import PersonsPage from './PersonsPage'

type CostRow = { costType: string, party1Percent: number, party2Percent: number, affectsCapitalContribution?: boolean }
type Contract = {
  id?: string, rowVersion?: string, versionNumber: number, previousVersionId?: string, contractName: string, effectiveFrom: string,
  baseCurrency: 'USD' | 'IRR' | 'CNY' | 'EUR', businessStructure: 'SoleOwnership' | 'Partnership', partnerPersonId?: string, primaryInvestorId?: string, partnerInvestorId?: string,
  normalSaleProfitParty1Percent: number, normalSaleProfitParty2Percent: number,
  creditSaleProfitParty1Percent: number, creditSaleProfitParty2Percent: number, lossParty1Percent: number, lossParty2Percent: number,
  costResponsibilities: CostRow[], cashSalesAllowed: boolean, creditSalesAllowed: boolean,
  creditCalculationMethod?: 'MonthlyPercentage' | 'NegotiatedAmount' | 'TermWeightedDueDate', defaultCreditRatePercent?: number,
  checkCollectionGracePeriodDays?: number, responsiblePartyAfterGracePeriod?: Party, receivablesFinancingAllowed: boolean,
  financingCostResponsibleParty?: Party, financedCheckPrincipalRiskParty?: Party,
  partnerEntitlementCreatedWhen: 'OnTransactionPosting' | 'OnCashCollection' | 'OnSettlement',
  cashSaleClaimPayableWhen: 'OnSalePosting' | 'OnCashCollection', creditSaleClaimPayableWhen: 'OnCollection' | 'OnDueDate' | 'OnSettlement',
  useActualTransactionFxRate: boolean, separateFxPurchaseAndPartnerRemittance: boolean, carryPartnerOverpaymentToCurrentAccount: boolean
}
type Party = 'Party1' | 'Party2' | 'Shared'
type Investor = { id: string, investorCode: string, legalName: string, personType: string, phone?: string, address?: string, rowVersion?: string, locked?: boolean }
type Response = { contract: Contract | null, hasOperationalTransactions: boolean, state: 'Missing' | 'Editable' | 'Locked', partners: { id: string, displayName: string, locked?: boolean }[], investors: Investor[] }
type Mode = 'view' | 'create' | 'edit' | 'amend'
type IdentityDraft = { investorCode: string, legalName: string, personType: string, phone: string }
const emptyIdentity = (): IdentityDraft => ({ investorCode: '', legalName: '', personType: 'Company', phone: '' })

const costTypes = ['GoodsPurchase', 'Insurance', 'InternationalFreight', 'Customs', 'DomesticFreight', 'Warehousing', 'Commission', 'BadDebt', 'ReturnedCheck', 'ReceivablesFinancing', 'RemittanceFee'] as const
const costLabels = {
  GoodsPurchase: 'goodsPurchase', Insurance: 'cargoInsurance', InternationalFreight: 'internationalFreight', Customs: 'customsCosts',
  DomesticFreight: 'domesticFreight', Warehousing: 'goodsWarehouseStorage', Commission: 'salesCommission', BadDebt: 'badDebt',
  ReturnedCheck: 'returnedCheck', ReceivablesFinancing: 'receivablesFinancing', RemittanceFee: 'remittanceFee'
} as const
const configurableCapitalCosts = new Set(['Warehousing', 'Commission', 'RemittanceFee'])
const legacyCostTypes: Record<string, string> = { BadDebtReturnedCheck: 'BadDebt', Clearance: 'Customs', Demurrage: 'Customs', CustomsWarehousing: 'Customs', CustomsStorage: 'Customs' }

function normalizeCostRows(rows: CostRow[] = []): CostRow[] {
  return costTypes.map(costType => {
    const existing = rows.find(row => (legacyCostTypes[row.costType] ?? row.costType) === costType)
      ?? (costType === 'ReturnedCheck' ? rows.find(row => row.costType === 'BadDebtReturnedCheck') : undefined)
    return {
      costType,
      party1Percent: existing?.party1Percent ?? 100,
      party2Percent: existing?.party2Percent ?? 0,
      affectsCapitalContribution: configurableCapitalCosts.has(costType) ? existing?.affectsCapitalContribution ?? true : true
    }
  })
}

function blankContract(): Contract {
  return {
    versionNumber: 1, contractName: '', effectiveFrom: localTodayIso(), baseCurrency: 'USD', businessStructure: 'SoleOwnership',
    normalSaleProfitParty1Percent: 100, normalSaleProfitParty2Percent: 0,
    creditSaleProfitParty1Percent: 100, creditSaleProfitParty2Percent: 0, lossParty1Percent: 100, lossParty2Percent: 0,
    costResponsibilities: normalizeCostRows(),
    cashSalesAllowed: true, creditSalesAllowed: false, receivablesFinancingAllowed: false,
    partnerEntitlementCreatedWhen: 'OnTransactionPosting', cashSaleClaimPayableWhen: 'OnCashCollection', creditSaleClaimPayableWhen: 'OnCollection',
    useActualTransactionFxRate: true, separateFxPurchaseAndPartnerRemittance: true, carryPartnerOverpaymentToCurrentAccount: true
  }
}

export default function BusinessContractPage({ language, canEdit }: { language: Language, canEdit: boolean }) {
  const t = businessContractText[language]
  const [server, setServer] = useState<Response>()
  const [draft, setDraft] = useState<Contract>(blankContract)
  const [mode, setMode] = useState<Mode>('view')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [identities, setIdentities] = useState<[IdentityDraft, IdentityDraft]>([emptyIdentity(), emptyIdentity()])
  const [creatingPartner, setCreatingPartner] = useState(false)
  const [editingPartnerId, setEditingPartnerId] = useState<string>()
  const pageRef = useRef<HTMLElement>(null)
  const editable = canEdit && mode !== 'view'
  const canCreate = canEdit && mode === 'view' && server?.state === 'Missing' && !server.contract
  const sole = draft.businessStructure === 'SoleOwnership'

  async function load() {
    setLoading(true); setError('')
    try {
      const value = await api<Response>('/api/business-contract')
      setServer(value)
      setDraft(value.contract ? { ...value.contract, costResponsibilities: normalizeCostRows(value.contract.costResponsibilities) } : blankContract())
      setIdentities([value.contract?.primaryInvestorId, value.contract?.partnerInvestorId].map(id => {
        const identity = value.investors.find(x => x.id === id)
        return identity ? { investorCode: identity.investorCode, legalName: identity.legalName, personType: identity.personType, phone: identity.phone ?? '' } : emptyIdentity()
      }) as [IdentityDraft, IdentityDraft])
      setMode('view')
    } catch { setError(t.loadFailed) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!loading && canEdit && mode !== 'view') pageRef.current?.querySelector<HTMLInputElement>('.system-date-segment.day')?.focus()
    else if (!loading && canCreate) pageRef.current?.focus()
  }, [loading, mode, canEdit, canCreate])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (creatingPartner || pageRef.current?.closest('[aria-hidden="true"]')) return
      if (event.key !== 'Escape') return
      if (mode !== 'view') { event.preventDefault(); cancel(); return }
      event.preventDefault()
      window.dispatchEvent(new Event('close-active-form'))
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [mode, creatingPartner])

  function beginCreate() {
    if (!canCreate || saving) return
    setDraft(blankContract()); setMode('create'); setMessage(''); setError('')
  }

  const allocationRows = useMemo(() => [
    { label: t.normalProfit, one: 'normalSaleProfitParty1Percent', two: 'normalSaleProfitParty2Percent' },
    { label: t.creditProfit, one: 'creditSaleProfitParty1Percent', two: 'creditSaleProfitParty2Percent' },
    { label: t.lossShare, one: 'lossParty1Percent', two: 'lossParty2Percent' }
  ] as const, [t])

  function setStructure(value: Contract['businessStructure']) {
    setDraft(current => {
      const partnership = value === 'Partnership'
      const allocations = partnership
        ? { normalSaleProfitParty1Percent: 50, normalSaleProfitParty2Percent: 50, creditSaleProfitParty1Percent: 50, creditSaleProfitParty2Percent: 50, lossParty1Percent: 50, lossParty2Percent: 50 }
        : { normalSaleProfitParty1Percent: 100, normalSaleProfitParty2Percent: 0, creditSaleProfitParty1Percent: 100, creditSaleProfitParty2Percent: 0, lossParty1Percent: 100, lossParty2Percent: 0 }
      return { ...current, ...allocations, businessStructure: value, partnerPersonId: partnership ? current.partnerPersonId : undefined,
        costResponsibilities: current.costResponsibilities.map(x => partnership ? { ...x, party1Percent: 50, party2Percent: 50 } : { ...x, party1Percent: 100, party2Percent: 0 }) }
    })
  }

  function setAllocation(one: (typeof allocationRows)[number]['one'], two: (typeof allocationRows)[number]['two'], changed: 'one' | 'two', value: number) {
    const percentage = clampPercentage(value)
    setDraft(current => ({ ...current, [one]: changed === 'one' ? percentage : 100 - percentage, [two]: changed === 'two' ? percentage : 100 - percentage }))
  }

  function setCostAllocation(index: number, changed: 'one' | 'two', value: number) {
    const percentage = clampPercentage(value)
    setDraft(current => ({
      ...current,
      costResponsibilities: current.costResponsibilities.map((row, rowIndex) => rowIndex === index
        ? { ...row, party1Percent: changed === 'one' ? percentage : 100 - percentage, party2Percent: changed === 'two' ? percentage : 100 - percentage }
        : row)
    }))
  }

  function setCostCapitalContribution(index: number, value: boolean) {
    setDraft(current => ({ ...current, costResponsibilities: current.costResponsibilities.map((row, rowIndex) => rowIndex === index
      ? { ...row, affectsCapitalContribution: value } : row) }))
  }

  function validate() {
    if (!draft.contractName.trim()) return t.nameRequired
    if (!draft.effectiveFrom) return t.dateRequired
    if (!identities[0].legalName.trim() || !sole && (!identities[1].legalName.trim() || !identities[0].investorCode.trim() || !identities[1].investorCode.trim())) return t.investorRequired
    if (!sole && identities[0].investorCode.trim().toUpperCase() === identities[1].investorCode.trim().toUpperCase()) return t.investorCodeExists
    const pairs = allocationRows.map(x => [Number(draft[x.one]), Number(draft[x.two])]).concat(draft.costResponsibilities.map(x => [x.party1Percent, x.party2Percent]))
    if (!sole && pairs.some(([one, two]) => one < 0 || one > 100 || two < 0 || two > 100 || one + two !== 100)) return t.percentageError
    if (!draft.cashSalesAllowed && !draft.creditSalesAllowed) return t.salesRequired
    if (draft.creditSalesAllowed && (!draft.creditCalculationMethod || draft.checkCollectionGracePeriodDays == null || !draft.responsiblePartyAfterGracePeriod)) return t.validation
    if (draft.creditSalesAllowed && draft.receivablesFinancingAllowed && (!draft.financingCostResponsibleParty || !draft.financedCheckPrincipalRiskParty)) return t.validation
    return ''
  }

  async function save() {
    if (!editable || saving || (mode === 'edit' && server?.state !== 'Editable')) return
    const validation = validate()
    if (validation) { setError(validation); return }
    setSaving(true); setError(''); setMessage('')
    try {
      const primaryInvestorId = await persistIdentity(0)
      const partnerInvestorId = sole ? undefined : await persistIdentity(1)
      const path = mode === 'create' ? '/api/business-contract' : mode === 'amend' ? '/api/business-contract/amendments' : withRowVersion(`/api/business-contract/${draft.id}`, draft.rowVersion)
      await apiRequest(path, { method: mode === 'edit' ? 'PUT' : 'POST', body: JSON.stringify({ ...draft, primaryInvestorId, partnerInvestorId }) })
      setMessage(mode === 'create' ? t.saved : mode === 'edit' ? t.updated : t.amended)
      await load()
    } catch (e) {
      const code = e instanceof ApiError ? String(e.details?.code ?? '') : ''
      setError(code === 'INVESTOR_CODE_EXISTS' ? t.investorCodeExists : code === 'INVESTOR_IDENTITY_LOCKED' || code === 'CONTRACT_VERSION_LOCKED' ? t.lockedError : code === 'AMENDMENT_EFFECTIVE_DATE_INVALID' ? t.amendmentDate : code === 'CONTRACT_VALIDATION_FAILED' ? t.validation : t.saveFailed)
    } finally { setSaving(false) }
  }

  function cancel() { if (server?.contract) { void load(); setError('') } else if (mode === 'create') { setDraft(blankContract()); setMode('view'); setError(''); setMessage('') } }
  async function persistIdentity(index: 0 | 1) {
    const input = identities[index]
    const id = index === 0 ? draft.primaryInvestorId : draft.partnerInvestorId
    const existing = server?.investors.find(x => x.id === id)
    if (existing && existing.investorCode === input.investorCode && existing.legalName === input.legalName && (existing.phone ?? '') === input.phone && existing.personType === input.personType) return existing.id
    if (existing?.locked) throw new Error(t.lockedError)
    const body = { ...input, address: existing?.address, investorCode: sole && !input.investorCode.trim() ? undefined : input.investorCode }
    const investor = await apiRequest<Investor>(existing ? withRowVersion('/api/investors/' + existing.id, existing.rowVersion) : '/api/investors', { method: existing ? 'PUT' : 'POST', body: JSON.stringify(body) })
    setServer(current => current ? { ...current, investors: [...current.investors.filter(x => x.id !== investor.id), investor] } : current)
    setDraft(current => ({ ...current, [index === 0 ? 'primaryInvestorId' : 'partnerInvestorId']: investor.id }))
    setIdentities(current => current.map((x, i) => i === index ? { ...x, investorCode: investor.investorCode } : x) as [IdentityDraft, IdentityDraft])
    return investor.id
  }

  function identityBlock(index: 0 | 1) {
    const id = index === 0 ? draft.primaryInvestorId : draft.partnerInvestorId
    const identity = identities[index]
    const locked = !editable || server?.investors.find(x => x.id === id)?.locked
    const change = (key: keyof IdentityDraft, value: string) => setIdentities(current => current.map((x, i) => i === index ? { ...x, [key]: value } : x) as [IdentityDraft, IdentityDraft])
    return <div className="contract-identity" key={index}>
      <Field label={index === 0 ? t.primaryInvestor : t.partnerInvestor}><select disabled={!editable} value={id ?? ''} onChange={e => {
        const selected = server?.investors.find(x => x.id === e.target.value)
        setDraft(x => ({ ...x, [index === 0 ? 'primaryInvestorId' : 'partnerInvestorId']: selected?.id }))
        setIdentities(current => current.map((x, i) => i === index ? selected ? { investorCode: selected.investorCode, legalName: selected.legalName, personType: selected.personType, phone: selected.phone ?? '' } : emptyIdentity() : x) as [IdentityDraft, IdentityDraft])
      }}><option value="">{t.registerInvestor}</option>{server?.investors.filter(x => sole || x.id !== (index === 0 ? draft.partnerInvestorId : draft.primaryInvestorId)).map(x => <option key={x.id} value={x.id}>{x.investorCode} — {x.legalName}</option>)}</select></Field>
      {!sole && <Field label={t.investorCode}><input required disabled={locked} maxLength={30} value={identity.investorCode} onChange={e => change('investorCode',e.target.value)} /></Field>}
      <Field label={t.legalName}><input required disabled={locked} maxLength={200} value={identity.legalName} onChange={e => change('legalName',e.target.value)} /></Field>
      <Field label={t.identityType}><select disabled={locked} value={identity.personType} onChange={e => change('personType', e.target.value)}><option value="Company">{t.companyIdentity}</option><option value="Individual">{t.individualIdentity}</option></select></Field>
      <Field label={t.identityPhone}><input disabled={locked} maxLength={50} value={identity.phone} onChange={e => change('phone',e.target.value)} /></Field>
    </div>
  }
  function beginAmendment() { setDraft(current => ({ ...current, id: undefined, rowVersion: undefined, previousVersionId: current.id, versionNumber: current.versionNumber + 1, effectiveFrom: localTodayIso() })); setMode('amend'); setMessage(''); setError('') }
  const stateLabel = !server?.contract ? t.missing : server.hasOperationalTransactions ? t.locked : t.editable

  if (loading) return <section className="panel contract-loading">{t.title} — {language === 'fa' ? 'در حال دریافت…' : language === 'zh' ? '加载中…' : 'Loading…'}</section>
  if (creatingPartner) return <PersonsPage language={language} contractCreation={{ personId: editingPartnerId, onCancel: () => setCreatingPartner(false), onSaved: person => {
    setServer(current => current ? { ...current, partners: [...current.partners.filter(x => x.id !== person.id), person] } : current)
    setDraft(current => ({ ...current, partnerPersonId: person.id }))
    setCreatingPartner(false)
  } }} />
  return <section ref={pageRef} className="business-contract-page person-editor panel" tabIndex={-1}
    onKeyDown={event => {
      if (event.key !== ' ' || !canCreate || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if ((event.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]')) return
      event.preventDefault(); event.stopPropagation()
      pageRef.current?.querySelector<HTMLButtonElement>('[data-create-action]')?.click()
    }}>
    <div className="contract-scroll-content">
    <header className="contract-heading"><div><h1>{t.title}</h1><p>{t.subtitle}</p></div><span className={`contract-state ${server?.state?.toLowerCase() ?? 'missing'}`}>{stateLabel}</span></header>
    {error && <div className="form-message error-message" role="alert">{error}</div>}{message && <div className="form-message success-message" role="status">{message}</div>}

    <div className="contract-sections">
      <ContractSection title={t.basic}>
        <div className="contract-fields four">
          <Field label={t.effectiveFrom}><SystemDateInput value={draft.effectiveFrom} onChange={value => setDraft(x => ({ ...x, effectiveFrom: value }))} disabled={!editable} required suggestToday language={language} calendar={language === 'fa' ? 'persian' : 'gregorian'} /></Field>
          <Field label={t.structure}><select disabled={!editable} value={draft.businessStructure} onChange={e => setStructure(e.target.value as Contract['businessStructure'])}><option value="SoleOwnership">{t.sole}</option><option value="Partnership">{t.partnership}</option></select></Field>
          <Field label={t.contractName}><input disabled={!editable} value={draft.contractName} onChange={e => setDraft(x => ({ ...x, contractName: e.target.value }))} /></Field>
          <Field label={t.baseCurrency}><select disabled={!editable} value={draft.baseCurrency} onChange={e => setDraft(x => ({ ...x, baseCurrency: e.target.value as Contract['baseCurrency'] }))}>{['USD', 'IRR', 'CNY', 'EUR'].map(x => <option key={x}>{x}</option>)}</select></Field>
        </div>
      <div className={'contract-identities ' + (sole ? 'sole' : '')}>{identityBlock(0)}{!sole && identityBlock(1)}</div>
      {!sole && <div className="contract-fields"><Field label={t.partnerPerson}><select disabled={!editable} value={draft.partnerPersonId ?? ''} onChange={e => setDraft(current => ({ ...current, partnerPersonId: e.target.value || undefined }))}><option value="">—</option>{server?.partners.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></Field><button type="button" disabled={!editable} onClick={() => { setEditingPartnerId(undefined); setCreatingPartner(true) }}>{t.createPartnerPerson}</button><button type="button" disabled={!editable || !draft.partnerPersonId || server?.partners.find(person => person.id === draft.partnerPersonId)?.locked} onClick={() => { setEditingPartnerId(draft.partnerPersonId); setCreatingPartner(true) }}>{t.edit} — {t.partnerPerson}</button></div>}
      <p className="contract-ownership-note">{t.ownershipByContribution}</p>
      </ContractSection>

      <div className="contract-middle-row">
        <ContractSection title={t.profitLoss}>
          <div className={`allocation-list ${sole ? 'sole' : ''}`}>
            <div className="allocation-head"><strong></strong><span>{sole ? t.party1Only : t.party1}</span>{!sole && <span>{t.party2}</span>}</div>
            {allocationRows.map(row => <div className="allocation-row" key={row.one}><strong>{row.label}</strong><PercentInput disabled={!editable || sole} value={draft[row.one]} onChange={value => setAllocation(row.one, row.two, 'one', value)} /><PercentInput disabled={!editable || sole} hidden={sole} value={draft[row.two]} onChange={value => setAllocation(row.one, row.two, 'two', value)} /></div>)}
          </div>
        </ContractSection>

        <ContractSection title={t.salesSettlement}>
          <div className="contract-toggle-row"><Toggle label={t.cashAllowed} disabled={!editable} checked={draft.cashSalesAllowed} onChange={value => setDraft(x => ({ ...x, cashSalesAllowed: value }))} /><Toggle label={t.creditAllowed} disabled={!editable} checked={draft.creditSalesAllowed} onChange={value => setDraft(x => ({ ...x, creditSalesAllowed: value }))} />{draft.creditSalesAllowed && <Toggle label={t.financingAllowed} disabled={!editable} checked={draft.receivablesFinancingAllowed} onChange={value => setDraft(x => ({ ...x, receivablesFinancingAllowed: value }))} />}</div>
          {draft.creditSalesAllowed && <><div className="contract-fields four">
            <Field label={t.creditMethod}><select disabled={!editable} value={draft.creditCalculationMethod ?? ''} onChange={e => setDraft(x => ({ ...x, creditCalculationMethod: e.target.value as Contract['creditCalculationMethod'] }))}><option value="">{t.select}</option><option value="MonthlyPercentage">{t.monthly}</option><option value="NegotiatedAmount">{t.negotiated}</option><option value="TermWeightedDueDate">{t.weightedDue}</option></select></Field>
            <Field label={t.defaultRate}><input disabled={!editable} type="number" min="0" max="100" value={draft.defaultCreditRatePercent ?? ''} onChange={e => setDraft(x => ({ ...x, defaultCreditRatePercent: numeric(e.target.value) }))} /></Field>
            <Field label={t.graceDays}><input disabled={!editable} type="number" min="0" value={draft.checkCollectionGracePeriodDays ?? ''} onChange={e => setDraft(x => ({ ...x, checkCollectionGracePeriodDays: numeric(e.target.value) }))} /></Field>
            <PartySelect label={t.afterGrace} value={draft.responsiblePartyAfterGracePeriod} disabled={!editable} t={t} onChange={value => setDraft(x => ({ ...x, responsiblePartyAfterGracePeriod: value }))} />
          </div>
          {draft.receivablesFinancingAllowed && <div className="contract-fields two"><PartySelect label={t.financingCost} value={draft.financingCostResponsibleParty} disabled={!editable} t={t} onChange={value => setDraft(x => ({ ...x, financingCostResponsibleParty: value }))} /><PartySelect label={t.principalRisk} value={draft.financedCheckPrincipalRiskParty} disabled={!editable} t={t} onChange={value => setDraft(x => ({ ...x, financedCheckPrincipalRiskParty: value }))} /></div>}</>}
          {!sole && draft.creditSalesAllowed && <div className="contract-fields three">
            <Field label={t.creditPayable}><select disabled={!editable} value={draft.creditSaleClaimPayableWhen} onChange={e => setDraft(x => ({ ...x, creditSaleClaimPayableWhen: e.target.value as Contract['creditSaleClaimPayableWhen'] }))}><option value="OnCollection">{t.onCollection}</option><option value="OnDueDate">{t.onDueDate}</option><option value="OnSettlement">{t.onSettlement}</option></select></Field>
          </div>}<div className="contract-toggle-row triple"><Toggle label={t.actualFx} disabled={!editable} checked={draft.useActualTransactionFxRate} onChange={value => setDraft(x => ({ ...x, useActualTransactionFxRate: value }))} />{!sole && <Toggle label={t.separateEvents} disabled={!editable} checked={draft.separateFxPurchaseAndPartnerRemittance} onChange={value => setDraft(x => ({ ...x, separateFxPurchaseAndPartnerRemittance: value }))} />}{!sole && <Toggle label={t.carryOverpayment} disabled={!editable} checked={draft.carryPartnerOverpaymentToCurrentAccount} onChange={value => setDraft(x => ({ ...x, carryOverpaymentToCurrentAccount: value }))} />}</div>
        </ContractSection>
      </div>

      {!sole && <div className="partnership-settlement-row">
        <Field className="partnership-inline-field" label={t.entitlement}><select disabled={!editable} value={draft.partnerEntitlementCreatedWhen} onChange={e => setDraft(x => ({ ...x, partnerEntitlementCreatedWhen: e.target.value as Contract['partnerEntitlementCreatedWhen'] }))}><option value="OnTransactionPosting">{t.onPosting}</option><option value="OnCashCollection">{t.onCollection}</option><option value="OnSettlement">{t.onSettlement}</option></select></Field>
        <Field className="partnership-inline-field" label={t.cashPayable}><select disabled={!editable} value={draft.cashSaleClaimPayableWhen} onChange={e => setDraft(x => ({ ...x, cashSaleClaimPayableWhen: e.target.value as Contract['cashSaleClaimPayableWhen'] }))}><option value="OnSalePosting">{t.onSalePosting}</option><option value="OnCashCollection">{t.onCollection}</option></select></Field>
      </div>}

      <ContractSection title={t.costs}>
        <div className={`cost-list ${sole ? 'sole' : ''}`}>{[0,1].map(column => <div key={column} className="cost-head"><strong></strong><span>{sole ? t.party1Only : t.party1}</span>{!sole && <span>{t.party2}</span>}<span className="cost-capital-heading">{t.affectsCapitalContribution}</span></div>)}
          {draft.costResponsibilities.map((row, index) => {
            if (!(row.costType in costLabels)) return null
            const label = costLabels[row.costType as keyof typeof costLabels]
            const fixedCapital = !configurableCapitalCosts.has(row.costType)
            const capitalized = fixedCapital || row.affectsCapitalContribution !== false
            return <div className="cost-row" key={row.costType}><strong>{t[label]}</strong><PercentInput disabled={!editable || sole} value={row.party1Percent} onChange={value => setCostAllocation(index, 'one', value)} /><PercentInput hidden={sole} disabled={!editable || sole} value={row.party2Percent} onChange={value => setCostAllocation(index, 'two', value)} /><label className="cost-capital-checkbox"><input type="checkbox" checked={capitalized} disabled={!editable || fixedCapital} onChange={event => setCostCapitalContribution(index, event.target.checked)} /><span className="sr-only">{t.affectsCapitalContribution}</span></label></div>
          })}
        </div>
      </ContractSection>

      <ContractSection title={t.contractStatus}>
        <dl className="contract-status-list"><div><dt>{t.version}</dt><dd>{draft.versionNumber || 1}</dd></div><div><dt>{t.previousVersion}</dt><dd>{draft.previousVersionId ? draft.versionNumber - 1 : '—'}</dd></div><div><dt>{t.operationalState}</dt><dd>{server?.hasOperationalTransactions ? t.operationsStarted : t.noOperations}</dd></div></dl>
      </ContractSection>
    </div>

    </div>
    <footer className="shortcut-bar">
      {canCreate && <button type="button" data-create-action="true" disabled={saving} onClick={beginCreate}><kbd>Space</kbd><span>{language === 'fa' ? 'ایجاد' : language === 'zh' ? '创建' : 'Create'}</span></button>}
      {canEdit && mode === 'create' && <><button type="button" data-save-action="true" className="primary" disabled={saving} onClick={() => void save()}><kbd>F3</kbd><span>{saving ? t.saving : t.save}</span></button><button type="button" disabled={saving} onClick={cancel}><kbd aria-hidden="true">&nbsp;</kbd><span>{t.cancel}</span></button></>}
      {canEdit && mode === 'view' && server?.state === 'Editable' && <button type="button" onClick={() => { setMode('edit'); setMessage('') }}><kbd aria-hidden="true">&nbsp;</kbd><span>{t.edit}</span></button>}
      {canEdit && mode === 'view' && server?.state === 'Locked' && <button type="button" onClick={beginAmendment}><kbd aria-hidden="true">&nbsp;</kbd><span>{t.createAmendment}</span></button>}
      {mode === 'edit' && <><button type="button" data-save-action="true" className="primary" disabled={saving || !canEdit || server?.state !== 'Editable'} onClick={() => void save()}><kbd>F3</kbd><span>{saving ? t.saving : t.update}</span></button><button type="button" disabled={saving} onClick={cancel}><kbd aria-hidden="true">&nbsp;</kbd><span>{t.cancel}</span></button></>}
      {mode === 'amend' && <><button type="button" data-save-action="true" className="primary" disabled={saving || !canEdit} onClick={() => void save()}><kbd>F3</kbd><span>{saving ? t.saving : t.saveAmendment}</span></button><button type="button" disabled={saving} onClick={cancel}><kbd aria-hidden="true">&nbsp;</kbd><span>{t.cancel}</span></button></>}
    </footer>
  </section>
}

function ContractSection({ title, children }: { title: string, children: React.ReactNode }) { return <article className="panel contract-section"><h2>{title}</h2>{children}</article> }
function Field({ label, children, className = '' }: { label: string, children: React.ReactNode, className?: string }) { return <label className={`contract-field ${className}`}><span>{label}</span>{children}</label> }
function PercentInput({ value, onChange, disabled, hidden }: { value: number, onChange: (value: number) => void, disabled?: boolean, hidden?: boolean }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)

  function normalizedDigits(raw: string) {
    return raw.replace(/[۰-۹٠-٩]/g, digit => {
      const code = digit.charCodeAt(0)
      return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660))
    })
  }

  function finishEditing() {
    const raw = normalizedDigits(text).trim()
    const parsed = raw !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN
    // Empty/incomplete text restores the last committed percentage, never an implicit zero.
    const normalized = Number.isFinite(parsed) ? clampPercentage(parsed) : value
    setText(String(normalized))
    setEditing(false)
    if (normalized !== value) onChange(normalized)
  }

  return hidden ? null : <label className="percent-input" dir="ltr">
    <input type="text" inputMode="decimal" disabled={disabled} value={editing ? text : String(value)}
      onFocus={event => { setText(String(value)); setEditing(true); event.currentTarget.select() }}
      onChange={event => {
        const raw = event.target.value
        const normalized = normalizedDigits(raw)
        setText(normalized)
        if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return
        const parsed = Number(normalized)
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) onChange(parsed)
      }}
      onBlur={finishEditing}
      onKeyDown={event => { if (event.key === 'Enter') finishEditing() }} />
    <span aria-hidden="true" style={{ top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>%</span>
  </label>
}
function Toggle({ label, checked, onChange, disabled }: { label: string, checked: boolean, onChange: (value: boolean) => void, disabled?: boolean }) { return <label className="contract-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label> }
function PartySelect({ label, value, onChange, disabled, t }: { label: string, value?: Party, onChange: (value: Party) => void, disabled?: boolean, t: Record<string, string> }) { return <Field label={label}><select disabled={disabled} value={value ?? ''} onChange={e => onChange(e.target.value as Party)}><option value="">{t.select}</option><option value="Party1">{t.party1}</option><option value="Party2">{t.party2}</option><option value="Shared">{t.shared}</option></select></Field> }
function numeric(value: string) { return value === '' ? undefined : Number(value) }
function clampPercentage(value: number) { return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) }
