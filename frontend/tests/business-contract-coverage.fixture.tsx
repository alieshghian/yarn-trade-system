import {createRoot} from 'react-dom/client'
import BusinessContractPage from '../src/BusinessContractPage'
import {installFormInteraction} from '../src/formInteraction'
import '../src/styles.css'
import '../src/components/base-form/formTheme.css'

if (!import.meta.env.DEV) throw Error('Isolated contract fixture only')
const params = new URLSearchParams(location.search)
const initial = {
  id:'contract-v1', rowVersion:'fixture-v1', versionNumber:1, contractName:'قرارداد آزمایشی اصیل',
  effectiveFrom:'2024-01-01', businessStructure:'SoleOwnership', baseCurrency:'USD',
  primaryInvestorId:'investor-1', normalSaleProfitParty1Percent:100, normalSaleProfitParty2Percent:0,
  creditSaleProfitParty1Percent:100, creditSaleProfitParty2Percent:0, lossParty1Percent:100, lossParty2Percent:0,
  costResponsibilities:[], cashSalesAllowed:true, creditSalesAllowed:false, receivablesFinancingAllowed:false,
  partnerEntitlementCreatedWhen:'OnTransactionPosting', cashSaleClaimPayableWhen:'OnCashCollection',
  creditSaleClaimPayableWhen:'OnCollection', useActualTransactionFxRate:true,
  separateFxPurchaseAndPartnerRemittance:true, carryPartnerOverpaymentToCurrentAccount:true,
}
const investors = [{id:'investor-1',investorCode:'I-1',legalName:'سرمایه‌گذار ثابت',personType:'Company',locked:true}]
let contract = JSON.parse(sessionStorage.getItem('contract-coverage-record') ?? 'null') ?? initial
const evidence = { writes: [] as unknown[], failNext: true }
Object.assign(window, { contractEvidence:evidence })
window.fetch = async (input, options) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.origin)
  const method = options?.method ?? 'GET'
  if (url.pathname === '/api/business-contract' && method === 'GET')
    return Response.json({contract, investors, partners:[], state:params.has('editable')?'Editable':'Locked', hasOperationalTransactions:!params.has('editable')})
  if (url.pathname.startsWith('/api/field-validation/')) return Response.json({error:null})
  const body = options?.body ? JSON.parse(String(options.body)) : null
  evidence.writes.push({method, path:url.pathname, version:url.searchParams.get('rowVersion'), body})
  if (url.pathname === '/api/business-contract/amendments' && method === 'POST') {
    if (evidence.failNext) {
      evidence.failNext = false
      return Response.json({code:'CONTRACT_VERSION_LOCKED'}, {status:409})
    }
    contract = {...body, id:'contract-v2', rowVersion:'fixture-v2'}
    sessionStorage.setItem('contract-coverage-record', JSON.stringify(contract))
    return Response.json(contract, {status:201})
  }
  return Response.json({error:'Unexpected fixture write'}, {status:400})
}
installFormInteraction()
createRoot(document.getElementById('root')!).render(<div className="form-tab-pane active"><BusinessContractPage language="fa" canEdit={!params.has('viewer')}/></div>)
