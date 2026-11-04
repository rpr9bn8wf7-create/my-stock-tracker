/* Morrow 1.3 — local-first portfolio accounting, previewed CSV imports, editable provider fees.
   GBP is the accounting currency. Existing Morrow investments and Journey stay intact. */
(() => {
"use strict";
const repoVersion="1.3";
const keys={accounts:"morrowV13Accounts",transactions:"morrowV13Transactions",baselines:"morrowV13Baselines",epoch:"morrowV13Epoch"};
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v===null?fallback:v;}catch{return fallback;}};
const uid=()=>String(Date.now())+Math.random().toString(36).slice(2,10);
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Europe/London"});
const clean=s=>String(s??"").trim();
const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
const pounds=v=>money(v);
const unitPrice=v=>money(v); // two decimal places for display; retained numbers preserve full precision
const baselineFields=h=>({...h});
let accounts=read(keys.accounts,[]);
let transactions=read(keys.transactions,[]);
let baselines=read(keys.baselines,{});
let epoch=localStorage.getItem(keys.epoch)||"";
if(!Array.isArray(accounts))accounts=[];
if(!Array.isArray(transactions))transactions=[];
if(!baselines||Array.isArray(baselines)||typeof baselines!=="object")baselines={};
if(!accounts.some(a=>a.id==="default"))accounts.unshift({id:"default",name:"My investment account",provider:"Other",kind:"General account",feeModel:"unconfigured",openingCash:0});
if(!epoch){epoch=holdings.length?today():"";localStorage.setItem(keys.epoch,epoch);}
for(const h of holdings){if(!h.accountId)h.accountId="default";if(!baselines[h.id])baselines[h.id]={...baselineFields(h),snapshotDate:epoch||today()};}
function persist(){localStorage.setItem(keys.accounts,JSON.stringify(accounts));localStorage.setItem(keys.transactions,JSON.stringify(transactions));localStorage.setItem(keys.baselines,JSON.stringify(baselines));localStorage.setItem(keys.epoch,epoch);}
persist();
const getAccount=id=>accounts.find(a=>a.id===id)||accounts[0];
const safeId=id=>JSON.stringify(String(id)).replace(/</g,"\\u003c");
function holdingCost(h){return Number.isFinite(Number(h.capital))?numeric(h.capital):numeric(h.units)*numeric(h.buy);}
function holdingValue(h){return Number.isFinite(Number(h.accountValue))?numeric(h.accountValue):numeric(h.units)*numeric(h.price);}
function valuation(h){
 const raw=holdingValue(h),calculated=numeric(h.units)*numeric(h.price);
 if(h.valuationMode==="provider")return Number.isFinite(Number(h.accountValue))?numeric(h.accountValue):raw;
 return h.valuationMode==="market"&&numeric(h.units)>0&&numeric(h.price)>0&&(h.nativeCurrency||"GBP")==="GBP"?calculated:raw;
}
function signedCash(t){
 const n=numeric(t.amount);
 if(t.type==="deposit"||t.type==="sell"||t.type==="dividend"||t.type==="interest")return n;
 if(t.type==="withdrawal"||t.type==="buy")return -n;
 if(t.type==="fee")return t.feePaidFrom==="external"?0:-n;
 return 0;
}
function cashFor(id){return numeric(getAccount(id).openingCash)+transactions.filter(t=>!t.historical&&t.accountId===id).reduce((s,t)=>s+signedCash(t),0);}
function snapshotInvested(){return Object.values(baselines).reduce((s,h)=>s+holdingCost(h),0);}
function externalFlows(){return transactions.filter(t=>!t.historical).reduce((s,t)=>s+(t.type==="deposit"?numeric(t.amount):t.type==="withdrawal"?-numeric(t.amount):t.type==="fee"&&t.feePaidFrom==="external"?numeric(t.amount):0),0);}
function accountInvestedBalance(id){return holdings.filter(h=>(h.accountId||"default")===id).reduce((s,h)=>s+valuation(h),0);}
function portfolioMetrics(){
 const invested=snapshotInvested()+accounts.reduce((s,a)=>s+numeric(a.openingCash),0)+externalFlows();
 const securities=holdings.reduce((s,h)=>s+valuation(h),0);
 const cash=accounts.reduce((s,a)=>s+cashFor(a.id),0);
 const total=securities+cash;
 const fees=transactions.filter(t=>!t.historical&&t.type==="fee").reduce((s,t)=>s+numeric(t.amount),0);
 const income=holdings.reduce((s,h)=>s+numeric(baselines[h.id]?.incomeEarned),0)+transactions.filter(t=>!t.historical&&(t.type==="dividend"||t.type==="interest")).reduce((s,t)=>s+numeric(t.amount),0);
 const paidOutside=holdings.reduce((s,h)=>s+numeric(baselines[h.id]?.incomeEarned),0);
 return {invested,total,cash,securities,gain:total-invested+paidOutside,income,fees,paidOutside};
}
function accountFee(a){
 const balance=accountInvestedBalance(a.id);
 if(a.feeModel==="vanguard-self"||a.feeModel==="vanguard-junior"||a.feeModel==="vanguard-managed"){
   const group=accounts.filter(x=>x.provider==="Vanguard"&&["vanguard-self","vanguard-junior","vanguard-managed"].includes(x.feeModel));
   const combined=group.reduce((s,x)=>s+accountInvestedBalance(x.id),0);
   const hasSelf=group.some(x=>x.feeModel==="vanguard-self");
   const charge=hasSelf&&combined<32000?48:Math.min(375,combined*0.0015);
   const share=combined>0?charge*balance/combined:0;
   return share+(a.feeModel==="vanguard-managed"?balance*0.002:0);
 }
 if(a.feeModel==="custom")return Math.min(a.annualCap>0?numeric(a.annualCap):Infinity,numeric(a.fixedAnnual)+balance*numeric(a.percentAnnual)/100);
 return null;
}
function formatUnits(n){return new Intl.NumberFormat("en-GB",{maximumFractionDigits:6}).format(numeric(n));}
const esc=escapeHTML;
const el=id=>$(id);
function renderV13(){
 for(const h of holdings){if(!h.accountId)h.accountId="default";if(!baselines[h.id])baselines[h.id]={...baselineFields(h),snapshotDate:today()};}
 const m=portfolioMetrics();
 el("total").textContent=pounds(m.total);
 el("invested").textContent=pounds(m.invested);
 el("profit").textContent=pounds(m.gain);
 el("profit").className="value "+(m.gain>=0?"positive":"negative");
 el("percent").textContent=(m.invested?m.gain/m.invested*100:0).toFixed(2)+"% simple net return";
 el("percent").className="meta "+(m.gain>=0?"positive":"negative");
 el("v13Income").textContent=pounds(m.income);
 el("v13Fees").textContent=pounds(m.fees);
 let basis=Math.max(0,m.invested),growth=Math.max(0,m.total-m.invested),denominator=basis+growth;
 const percent=denominator>0?basis/denominator*100:100;
 el("portfolioDonut").style.background="conic-gradient(var(--orange) 0 "+percent+"%,var(--green) "+percent+"% 100%)";
 el("donutValue").textContent=pounds(m.total);
 el("donutCapital").textContent=pounds(m.invested);
 el("donutGrowth").textContent=pounds(m.total-m.invested);
 el("donutGrowth").className=m.total>=m.invested?"positive":"negative";
 el("donutCash").textContent=pounds(m.cash);
 el("holdingsCount").textContent=String(holdings.length);
 const negative=accounts.filter(a=>cashFor(a.id)<-0.005);
 el("v13CashWarning").hidden=!negative.length;
 if(negative.length)el("v13CashWarning").textContent="Cash reconciliation needed: "+negative.map(a=>a.name+" "+pounds(cashFor(a.id))).join("; ")+". Check missing deposits or opening balances. Negative cash is shown rather than silently hidden.";
 el("holdings").innerHTML=holdings.length?holdings.map(h=>{
   const value=valuation(h),cost=holdingCost(h),gain=value-cost;
   const cls=gain>=0?"positive":"negative";
   return '<article class="holding"><div><strong class="holding-name">'+esc(h.name)+'</strong> <span class="v13-pill">'+esc(h.ticker)+'</span><div class="meta">'+esc(getAccount(h.accountId).name)+' · '+formatUnits(h.units)+' units · Latest unit '+unitPrice(h.price)+'</div></div>'+
   '<div><div class="holding-value">'+pounds(value)+'</div><div class="'+cls+'">'+pounds(gain)+' ('+(cost?gain/cost*100:0).toFixed(2)+'%)</div></div>'+
   '<div class="holding-actions v13-small-actions"><button class="secondary" type="button" data-holding-detail="'+esc(h.id)+'">Details & activity</button><button class="secondary" type="button" data-holding-journey="'+esc(h.id)+'">Investment journey</button><button class="secondary" type="button" data-holding-edit="'+esc(h.id)+'">Edit snapshot</button><button class="danger" type="button" data-holding-remove="'+esc(h.id)+'">Remove</button></div></article>';
 }).join(""):'<div class="empty">No investments yet. Choose <strong>New investment</strong> or <strong>Import CSV</strong> to begin.</div>';
 el("v13Disclaimer").textContent="Returns use recorded starting values and net external cash flows, not a time-weighted return. Most holdings need periodic provider-value updates; only compatible GBP holdings use the market feed. Morrow stores records locally in this browser.";
 renderTransactions();
 renderAccounts();
 if(activeDetailId)renderDetail();
 persist();
}
render=renderV13;
function saveV13(){persist();localStorage.setItem(storageKey,JSON.stringify(holdings));renderV13();}
function refreshAccountOptions(){
 const options=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+' · '+esc(a.provider)+'</option>').join("");
 for(const id of ["holdingAccount","transactionAccount","importAccount"]){const s=el(id);if(!s)continue;const old=s.value;s.innerHTML=options+(id==="holdingAccount"?'<option value="new">+ Create new provider account</option>':"");if([...s.options].some(o=>o.value===old))s.value=old;}
 refreshTransactionHoldings();
}
function refreshTransactionHoldings(){
 const s=el("transactionHolding");if(!s)return;
 const old=s.value;s.innerHTML='<option value="">Select investment (if applicable)</option>'+holdings.map(h=>'<option value="'+esc(h.id)+'">'+esc(h.ticker)+' · '+esc(h.name)+'</option>').join("");
 if([...s.options].some(o=>o.value===old))s.value=old;
}
let wizard=1;
function showWizard(step){
 wizard=Math.max(1,Math.min(4,step));
 document.querySelectorAll(".wizard-page").forEach(p=>p.hidden=Number(p.dataset.wizardStep)!==wizard);
 document.querySelectorAll("[data-step-button]").forEach(b=>{const n=Number(b.dataset.stepButton);b.classList.toggle("active",n===wizard);b.classList.toggle("completed",n<wizard);b.setAttribute("aria-current",n===wizard?"step":"false");});
 el("wizardBack").hidden=wizard===1;
 el("wizardNext").hidden=wizard===4;
 el("saveButton").hidden=wizard!==4;
 if(wizard===3)refreshFeePreview();
 if(wizard===4)renderWizardReview();
}
function validatePage(step){
 const page=document.querySelector('[data-wizard-step="'+step+'"]');
 for(const input of page.querySelectorAll("input[required],select[required]")){if(!input.checkValidity()){input.reportValidity();return false;}}
 if(step===2&&el("autoValue").checked&&numeric(el("units").value)<=0){alert("Enter a number of units to calculate the holding value automatically.");return false;}
 return true;
}
function openHoldingModal(edit=false){
 refreshAccountOptions();
 el("holdingModal").hidden=false;
 el("holdingModal").querySelector(".v13-dialog").scrollTop=0;
 document.body.style.overflow="hidden";
 showWizard(edit?2:1);
}
function closeHoldingModal(){
 el("holdingModal").hidden=true;
 document.body.style.overflow="";
 resetForm();
}
function renderWizardReview(){
 const data=[["Investment",el("name").value+" ("+el("ticker").value.toUpperCase()+")"],["Starting capital","£"+(numeric(el("capital").value)).toFixed(2)],["Current value",el("autoValue").checked?"Auto from units × price":"£"+numeric(el("accountValue").value).toFixed(2)],["Units",formatUnits(el("units").value)],["Account",el("holdingAccount").value==="new"?el("newAccountName").value:getAccount(el("holdingAccount").value).name],["Estimated fund OCF",el("holdingOcf").value?el("holdingOcf").value+"% annually":"Not specified"]];
 el("wizardReview").innerHTML=data.map(([a,b])=>'<div>'+esc(a)+'<strong>'+esc(b)+'</strong></div>').join("");
}
function fillProviderTemplate(){
 const p=el("newProvider").value,kind=el("newAccountKind").value;
 const v=p==="Vanguard";
 el("newFeeModel").value=v?(kind==="Junior ISA"?"vanguard-junior":kind==="Managed ISA"?"vanguard-managed":"vanguard-self"):"unconfigured";
 refreshFeePreview();
}
function refreshFeePreview(){
 const isNew=el("holdingAccount").value==="new";
 el("newAccountFields").hidden=!isNew;
 if(isNew){
  const model=el("newFeeModel").value;
  el("wizardFeeText").textContent=model.startsWith("vanguard")?"Vanguard UK indicative rates: self-managed can cost £4/month below £32,000, otherwise 0.15% annually (max £375). Junior ISA has no £4/month minimum. Managed adds a 0.20% management fee. Verify your terms.":"No published fees are assumed for this provider. Add or edit its charges in Costs & fees.";
 }else{
  const a=getAccount(el("holdingAccount").value),fee=accountFee(a);
  el("wizardFeeText").textContent=fee===null?"Fees not configured for this account yet. You can add them in Costs & fees.":"Indicative annual provider fees: "+pounds(fee)+" at the currently recorded balance. Actual charges may differ.";
 }
}
function resolveHoldingAccount(){
 if(el("holdingAccount").value!=="new")return el("holdingAccount").value||"default";
 const name=clean(el("newAccountName").value)||clean(el("newProvider").value)+" account";
 const a={id:uid(),name,provider:el("newProvider").value,kind:el("newAccountKind").value,feeModel:el("newFeeModel").value,openingCash:0};
 accounts.push(a);persist();
 return a.id;
}
window.resolveHoldingAccount=resolveHoldingAccount;
function refreshSnapshot(h){
 if(!h)return;
 baselines[h.id]={...baselineFields(h),snapshotDate:baselines[h.id]?.snapshotDate||today()};
}
const initialEdit=editHolding;
editHolding=function(id){
 if(transactions.some(t=>t.holdingId===id&&!t.historical)){alert("This investment already has transactions. To avoid double counting, record further changes in Transaction history rather than editing the starting snapshot.");return;}
 initialEdit(id);
 const h=holdings.find(x=>x.id===id);
 if(!h)return;
 refreshAccountOptions();
 el("holdingAccount").value=h.accountId||"default";
 el("holdingOcf").value=h.ocf??"";
 el("autoValue").checked=h.valuationMode==="market";
 openHoldingModal(true);
};
const initialDelete=deleteHolding;
deleteHolding=function(id){
 if(transactions.some(t=>t.holdingId===id)&&!confirm("This investment has linked transactions. Removing it will also remove those transactions. Continue?"))return;
 if(!confirm("Remove this investment from your tracker?"))return;
 holdings=holdings.filter(h=>h.id!==id);
 transactions=transactions.filter(t=>t.holdingId!==id);
 delete baselines[id];
 saveV13();
};
function recalculateHoldings(){
 const liveById=new Map(holdings.map(h=>[h.id,h]));
 const result=[];
 for(const base of Object.values(baselines)){
  if(!base||!base.id)continue;
  const last=liveById.get(base.id);
  const h={...base,accountId:base.accountId||"default"};
  if(last){h.price=last.price;h.quoteDate=last.quoteDate;h.quoteSource=last.quoteSource;h.journeyMonthly=last.journeyMonthly;h.valuationMode=last.valuationMode||base.valuationMode;h.providerValue=last.providerValue;h.providerAnchorIds=last.providerAnchorIds;}
  const events=transactions.filter(t=>!t.historical&&t.holdingId===h.id&&(t.type==="buy"||t.type==="sell")).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let u=numeric(h.units),basis=holdingCost(h),value=holdingValue(h);
  for(const t of events){
   const q=numeric(t.units),amount=numeric(t.amount);
   if(t.type==="buy"){u+=q;basis+=amount;value+=amount;}
   else {
     const fraction=u>0?Math.min(1,q/u):0;
     basis=Math.max(0,basis*(1-fraction));
     value=Math.max(0,value*(1-fraction));
     u=Math.max(0,u-q);
   }
  }
  h.units=u;h.capital=basis;
  if(h.valuationMode==="provider"&&Number.isFinite(Number(h.providerValue))){
    const anchor=new Set(Array.isArray(h.providerAnchorIds)?h.providerAnchorIds:[]);
    const uncounted=events.filter(t=>!anchor.has(t.id)).reduce((sum,t)=>sum+(t.type==="buy"?numeric(t.amount):-numeric(t.amount)),0);
    h.accountValue=Math.max(0,numeric(h.providerValue)+uncounted);
  } else h.accountValue=h.valuationMode==="market"&&u>0&&numeric(h.price)>0&&(h.nativeCurrency||"GBP")==="GBP"?u*numeric(h.price):value;
  result.push(h);
 }
 holdings=result;
 saveV13();
}
const initialSubmit=el("holdingForm");
let pendingEditId="";
initialSubmit.addEventListener("submit",()=>{
 pendingEditId=el("editId").value;
},true);
initialSubmit.addEventListener("submit",()=>{
 const h=pendingEditId?holdings.find(h=>h.id===pendingEditId):holdings[holdings.length-1];
 if(h){refreshSnapshot(h);persist();}
 pendingEditId="";
 closeHoldingModal();
 refreshAccountOptions();
 renderV13();
});
el("wizardNext").addEventListener("click",()=>{if(validatePage(wizard))showWizard(wizard+1);});
el("wizardBack").addEventListener("click",()=>showWizard(wizard-1));
document.querySelectorAll("[data-step-button]").forEach(b=>b.addEventListener("click",()=>{const step=Number(b.dataset.stepButton);if(step<=wizard||validatePage(wizard))showWizard(step);}));
el("holdingAccount").addEventListener("change",refreshFeePreview);
el("newProvider").addEventListener("change",fillProviderTemplate);
el("newAccountKind").addEventListener("change",fillProviderTemplate);
el("newFeeModel").addEventListener("change",refreshFeePreview);
el("autoValue").addEventListener("change",()=>{el("accountValue").required=!el("autoValue").checked;el("accountValue").disabled=el("autoValue").checked;});
el("price").addEventListener("input",()=>{if(el("autoValue").checked)el("accountValue").value=(numeric(el("units").value)*numeric(el("price").value)).toFixed(2);});
el("units").addEventListener("input",()=>{if(el("autoValue").checked)el("accountValue").value=(numeric(el("units").value)*numeric(el("price").value)).toFixed(2);});
el("openHoldingModal").addEventListener("click",()=>{resetForm();el("accountValue").required=true;el("accountValue").disabled=false;openHoldingModal();});
el("closeHoldingModal").addEventListener("click",closeHoldingModal);
el("cancelButton").addEventListener("click",closeHoldingModal);
el("holdingModal").addEventListener("click",e=>{if(e.target.id==="holdingModal")closeHoldingModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el("holdingModal").hidden)closeHoldingModal();});

/* Reversible transactions: all changes to holdings are derived from immutable snapshots. */
function normaliseType(raw){
 const t=clean(raw).toLowerCase();
 if(/^(deposit|cash in|payment in|cash deposit|top.?up|funding|funds added|add money)$/.test(t)||/deposit|cash in|top.?up/.test(t))return "deposit";
 if(/withdraw|cash out|payment out|funds removed/.test(t))return "withdrawal";
 if(/dividend|distribution|income payment/.test(t))return "dividend";
 if(/interest/.test(t))return "interest";
 if(/fee|charge|commission|stamp duty|levy/.test(t))return "fee";
 if(/sell|sale|disposal/.test(t))return "sell";
 if(/buy|purchase|acquisition/.test(t))return "buy";
 return "";
}
function normaliseDate(raw){
 const s=clean(raw);if(!s)return "";
 const iso=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
 if(iso){const y=iso[1],m=iso[2].padStart(2,"0"),d=iso[3].padStart(2,"0");return validDate(y+"-"+m+"-"+d);}
 const uk=s.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})/);
 if(uk){const y=uk[3].length===2?"20"+uk[3]:uk[3];return validDate(y+"-"+uk[2].padStart(2,"0")+"-"+uk[1].padStart(2,"0"));}
 return "";
}
function validDate(s){const d=new Date(s+"T12:00:00Z");return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s?s:"";}
function parseAmount(s){
 const t=clean(s).replace(/[£$€\s\u00a0]/g,"");
 if(!t)return 0;
 const neg=t.startsWith("(")&&t.endsWith(")");
 let v=t.replace(/[()]/g,"");
 if(v.includes(",")&&v.includes("."))v=v.lastIndexOf(",")>v.lastIndexOf(".")?v.replace(/\./g,"").replace(",","."):v.replace(/,/g,"");
 else if(v.includes(",")&&/,\d{1,2}$/.test(v))v=v.replace(",",".");
 else v=v.replace(/,/g,"");
 const n=Number(v.replace(/[^0-9.+-]/g,""));
 return Number.isFinite(n)?(neg?-Math.abs(n):n):NaN;
}
const signature=t=>[t.date,t.type,(t.ticker||"").toUpperCase(),numeric(t.amount).toFixed(2),numeric(t.units).toFixed(6),t.accountId||"default"].join("|");
function saveTransactions(){persist();recalculateHoldings();}
function renderTransactions(){
 const m=portfolioMetrics();
 el("v13TxCount").textContent=String(transactions.length);
 el("v13TxFees").textContent=pounds(m.fees);
 el("v13TxCash").textContent=pounds(m.cash);
 el("transactionList").innerHTML=transactions.length?[...transactions].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>
  '<div class="v13-row"><div><strong>'+esc(t.type[0].toUpperCase()+t.type.slice(1))+' · '+pounds(t.amount)+'</strong><small>'+esc(t.date)+' · '+esc(t.ticker||getAccount(t.accountId).name)+' · '+esc(t.source||"Manual")+(t.historical?' · Historical only':'')+(t.units?' · '+formatUnits(t.units)+' units':'')+'</small></div><div class="v13-small-actions"><span class="v13-badge">'+esc(t.historical?"Reference":"Recorded")+'</span><button class="secondary" type="button" data-tx-remove="'+esc(t.id)+'">Remove</button></div></div>'
 ).join(""):'<p class="empty">No transactions recorded. Add a transaction manually or import a CSV statement.</p>';
}
function transactionSource(t){return clean(t.source)||"Manual";}
function recordTransactions(rows){
 transactions.push(...rows);
 saveTransactions();
 refreshTransactionHoldings();
}
function applyManualTransaction(){
 const type=el("transactionType").value,accountId=el("transactionAccount").value;
 const holdingId=el("transactionHolding").value;
 const h=holdings.find(h=>h.id===holdingId);
 const amount=Math.abs(parseAmount(el("transactionAmount").value));
 const units=Math.abs(parseAmount(el("transactionUnits").value));
 if(!Number.isFinite(amount)||amount<=0)throw new Error("Enter a transaction amount greater than zero.");
 if(!normaliseDate(el("transactionDate").value))throw new Error("Enter a valid date.");
 if((type==="buy"||type==="sell")&&(!h||units<=0))throw new Error("Choose a holding and enter the units bought or sold.");
 if(type==="sell"&&units>numeric(h.units)+1e-7)throw new Error("You cannot sell more units than the current recorded holding.");
 if(h&&h.accountId!==accountId&&(type==="buy"||type==="sell"))throw new Error("This investment belongs to another account. Choose its account.");
 const t={id:uid(),date:el("transactionDate").value,type,accountId,holdingId:h?.id||"",ticker:h?.ticker||"",amount,units,price:numeric(el("transactionPrice").value),feePaidFrom:el("feePaidFrom").value,description:clean(el("transactionNote").value),source:"Manual",historical:false};
 t.fingerprint=signature(t);
 if(transactions.some(x=>signature(x)===t.fingerprint)&&!confirm("A similar transaction already exists. Add this as a separate transaction?"))return;
 recordTransactions([t]);
 el("transactionModal").hidden=true;document.body.style.overflow="";
 el("transactionForm").reset();
}
el("transactionDate").value=today();
function openTransactionModal(){
 refreshAccountOptions();el("transactionDate").value=today();
 el("transactionModal").hidden=false;document.body.style.overflow="hidden";
}
el("openTransactionModal").addEventListener("click",openTransactionModal);
el("openTransactionFromInvestments").addEventListener("click",openTransactionModal);
el("closeTransactionModal").addEventListener("click",()=>{el("transactionModal").hidden=true;document.body.style.overflow="";});
el("transactionModal").addEventListener("click",e=>{if(e.target.id==="transactionModal"){el("transactionModal").hidden=true;document.body.style.overflow="";}});
el("transactionForm").addEventListener("submit",e=>{e.preventDefault();try{applyManualTransaction();}catch(error){alert(error.message);}});
el("transactionType").addEventListener("change",()=>{
 const dealing=["buy","sell"].includes(el("transactionType").value);
 el("transactionHoldingGroup").hidden=!dealing;
 el("transactionUnitsGroup").hidden=!dealing;
 el("feePaidFromGroup").hidden=el("transactionType").value!=="fee";
});
function removeTransaction(id){
 const t=transactions.find(x=>x.id===id);if(!t)return;
 if(!confirm("Remove this transaction and recalculate the portfolio from the starting snapshots?"))return;
 transactions=transactions.filter(x=>x.id!==id);
 saveTransactions();
}
function renderDetail(){
 const h=holdings.find(x=>x.id===activeDetailId);
 if(!h){el("holdingDetail").hidden=true;activeDetailId="";return;}
 el("holdingDetail").hidden=false;
 el("detailName").textContent=h.name+" ("+h.ticker+")";
 el("detailValue").textContent=pounds(valuation(h));
 el("detailGain").textContent=pounds(valuation(h)-holdingCost(h));
 el("detailUnits").textContent=formatUnits(h.units);
 el("detailCost").textContent=pounds(holdingCost(h));
 el("detailPrice").textContent=unitPrice(h.price);
 el("detailOcf").textContent=Number.isFinite(Number(h.ocf))&&clean(h.ocf)!==""?numeric(h.ocf).toFixed(2)+"% annual OCF (indicative; already reflected in fund prices)":"Not recorded";
 el("detailAccount").textContent=getAccount(h.accountId).name;
 el("detailTransactions").innerHTML=transactions.filter(t=>t.holdingId===h.id).sort((a,b)=>b.date.localeCompare(a.date)).map(t=>'<div class="v13-row"><div><strong>'+esc(t.type)+' · '+pounds(t.amount)+'</strong><small>'+esc(t.date)+' · '+esc(transactionSource(t))+'</small></div></div>').join("")||'<p class="empty">No activity imported or recorded yet.</p>';
}
let activeDetailId="";
function openDetail(id){activeDetailId=id;renderDetail();el("holdingDetail").scrollIntoView({behavior:"smooth",block:"start"});}
el("closeDetail").addEventListener("click",()=>{activeDetailId="";el("holdingDetail").hidden=true;});
el("detailJourney").addEventListener("click",()=>{if(activeDetailId)openJourney(activeDetailId);});
function closeValuation(){el("valuationModal").hidden=true;document.body.style.overflow="";}
el("detailUpdateValue").addEventListener("click",()=>{
 const h=holdings.find(h=>h.id===activeDetailId);if(!h)return;
 el("valuationAmount").value=valuation(h).toFixed(2);
 el("valuationPrice").value=h.price??"";
 el("valuationDate").value=today();
 el("valuationModal").hidden=false;document.body.style.overflow="hidden";
});
el("closeValuationModal").addEventListener("click",closeValuation);
el("valuationModal").addEventListener("click",e=>{if(e.target.id==="valuationModal")closeValuation();});
el("valuationForm").addEventListener("submit",e=>{
 e.preventDefault();
 const h=holdings.find(h=>h.id===activeDetailId);if(!h)return;
 const v=Number(el("valuationAmount").value),date=normaliseDate(el("valuationDate").value);
 if(!Number.isFinite(v)||v<0||!date){alert("Enter a valid value and date.");return;}
 h.valuationMode="provider";h.providerValue=v;
 h.providerAnchorIds=transactions.filter(t=>!t.historical&&t.holdingId===h.id&&["buy","sell"].includes(t.type)).map(t=>t.id);
 h.accountValue=v;
 if(el("valuationPrice").value!=="")h.price=Math.max(0,numeric(el("valuationPrice").value));
 h.quoteDate=date;h.quoteSource="Provider value entered manually";
 saveV13();closeValuation();
});
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-holding-detail],[data-holding-journey],[data-holding-edit],[data-holding-remove],[data-tx-remove]");
 if(!b)return;
 if(b.dataset.holdingDetail)openDetail(b.dataset.holdingDetail);
 if(b.dataset.holdingJourney)openJourney(b.dataset.holdingJourney);
 if(b.dataset.holdingEdit)editHolding(b.dataset.holdingEdit);
 if(b.dataset.holdingRemove)deleteHolding(b.dataset.holdingRemove);
 if(b.dataset.txRemove)removeTransaction(b.dataset.txRemove);
});

/* CSV: browser-only RFC4180 reader, explicit mapping and per-row review. */
let csvRowsData=[],csvMap={},pendingRows=[];
function sniffDelimiter(text){
 const line=text.split(/\r?\n/).find(x=>x.trim())||"";
 const counts={",":0,";":0,"\t":0};let quoted=false;
 for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&Object.prototype.hasOwnProperty.call(counts,line[i]))counts[line[i]]++;}
 return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
function csvParse(text){
 const delim=sniffDelimiter(text);const rows=[];let row=[],cell="",quoted=false;
 text=String(text).replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===delim&&!quoted){row.push(cell);cell="";}
  else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(v=>clean(v)))rows.push(row);row=[];cell="";}
  else cell+=c;
 }
 if(quoted)throw new Error("This file contains an unclosed quoted field.");
 row.push(cell);if(row.some(v=>clean(v)))rows.push(row);
 return rows;
}
const columnNames={
 date:["date","transaction date","trade date","time","timestamp","date and time","executed","date/time","created at","settlement date"],
 type:["type","transaction type","action","activity","description type","order type","transaction","transaction details","event","activity type"],
 ticker:["ticker","symbol","stock symbol","investment","instrument","isin","security","security name","asset","product"],
 amount:["amount","net amount","total","total amount","net value","value","cash amount","amount (gbp)","net cash","transaction amount","net","cash flow"],
 units:["quantity","units","shares","number of shares","no. of shares","no of shares","quantity executed","volume","shares traded"],
 price:["price","unit price","share price","price / share","price per share","price per unit","price (gbp)","execution price"],
 currency:["currency","currency (total)","settlement currency","amount currency","net currency"],
 description:["description","details","narrative","note","instrument name","security description","comments"],
 reference:["id","transaction id","reference","order id","activity id","trade id"]
};
function canonical(s){return clean(s).toLowerCase().replace(/\s+/g," ").replace(/[_:]/g,"").replace(/\([^)]*\)/g,"").trim();}
function guessHeader(rows){
 let max=-1,best=0;
 for(let i=0;i<Math.min(12,rows.length);i++){
  const matches=Object.values(columnNames).flat().filter(alias=>rows[i].some(c=>canonical(c)===canonical(alias))).length;
  if(matches>max){max=matches;best=i;}
 }
 return best;
}
function autoMap(headers){
 const out={};
 for(const [key,aliases] of Object.entries(columnNames)){
  const i=headers.findIndex(h=>aliases.some(a=>canonical(h)===canonical(a)));
  out[key]=i>=0?String(i):"";
 }
 return out;
}
function mapControls(){
 const header=csvRowsData[0]||[];
 document.querySelectorAll("[data-map-field]").forEach(select=>{
  const key=select.dataset.mapField,chosen=csvMap[key];
  select.innerHTML='<option value="">Not in this file</option>'+header.map((h,i)=>'<option value="'+i+'">'+esc(h||"Column "+(i+1))+'</option>').join("");
  select.value=chosen??"";
 });
}
function mapFromControls(){
 document.querySelectorAll("[data-map-field]").forEach(s=>csvMap[s.dataset.mapField]=s.value);
}
function candidateFromRow(row,index){
 const val=key=>csvMap[key]!==""&&csvMap[key]!==undefined?clean(row[Number(csvMap[key])]):"";
 const date=normaliseDate(val("date")),type=normaliseType(val("type"));
 const ticker=val("ticker").toUpperCase().trim();
 const currency=(val("currency")||"GBP").toUpperCase().trim();
 const price=Math.abs(parseAmount(val("price"))),units=Math.abs(parseAmount(val("units")));
 const parsedAmount=parseAmount(val("amount"));
 let amount=Math.abs(parsedAmount);
 const reason=[];
 if(!date)reason.push("Date not recognised");
 if(!type)reason.push("Transaction type not recognised");
 if(!["GBP","GBX","GB PENCE","GB P"].includes(currency))reason.push("Non-GBP cash amount: "+currency);
 if(currency!=="GBP"&&currency.startsWith("GB"))amount/=100;
 if((!amount||!Number.isFinite(amount))&&units>0&&price>0)amount=units*price;
 if(!Number.isFinite(amount)||amount<=0)reason.push("Missing amount");
 if((type==="buy"||type==="sell")&&(!ticker||!units))reason.push("Buy/sell needs ticker and units");
 const accountId=el("importAccount").value||"default";
 const matches=holdings.filter(h=>h.ticker.toUpperCase()===ticker&&h.accountId===accountId);
 let holdingId=matches.length===1?matches[0].id:"";
 if(matches.length>1&&["buy","sell"].includes(type))reason.push("Ticker matches multiple holdings; choose manually");
 const newTicker=!holdingId&&!!ticker&&(type==="buy"||type==="sell");
 const source=el("importProvider").value==="auto"?"CSV import":el("importProvider").selectedOptions[0].text;
 const t={id:uid(),date,type,ticker,amount,units,price:price||0,accountId,holdingId,feePaidFrom:"account",description:val("description"),reference:val("reference"),source,historical:false};
 const base=holdingId?baselines[holdingId]:null;
 if(base&&date&&base.snapshotDate&&date<=base.snapshotDate){t.historical=true;reason.push("On/before snapshot; reference only");}
 if(!base&&epoch&&date&&date<=epoch){t.historical=true;reason.push("Before portfolio snapshot; reference only");}
 t.fingerprint=signature(t);
 const possibleDuplicate=transactions.some(existing=>signature(existing)===t.fingerprint||(t.reference&&existing.reference===t.reference&&existing.source===t.source));
 if(possibleDuplicate)reason.push("Possible duplicate");
 return {t,index,reason,blocked:reason.some(r=>!r.includes("snapshot")&&!r.includes("reference only")&&!r.includes("duplicate")),duplicate:possibleDuplicate,selected:!possibleDuplicate&&!reason.some(r=>!r.includes("snapshot")&&!r.includes("reference only"))};
}
function makeImportPreview(){
 mapFromControls();
 if(csvMap.date===""||csvMap.type===""){el("importStatus").className="v13-status warning";el("importStatus").textContent="Map at least the Date and Type columns to preview transactions.";el("importReview").hidden=true;return;}
 const rows=csvRowsData.slice(1);pendingRows=[];
 const seen=new Set();
 rows.forEach((row,i)=>{
   const p=candidateFromRow(row,i);
   const key=p.t.reference?["ref",p.t.reference,p.t.source].join("|"):signature(p.t);
   if(seen.has(key)){
     p.reason.push("Possible duplicate in this file");p.duplicate=true;p.selected=false;
   }
   seen.add(key);pendingRows.push(p);
 });
 const valid=pendingRows.filter(p=>!p.blocked).length,duplicates=pendingRows.filter(p=>p.duplicate).length,flagged=pendingRows.filter(p=>p.t.historical).length;
 el("importStatus").className="v13-status";
 el("importStatus").textContent=rows.length+" rows · "+valid+" usable · "+duplicates+" possible duplicates · "+flagged+" historical-only. Review the selection before importing.";
 el("importReview").hidden=false;
 el("importSummary").textContent="Unrecognised, non-GBP or incomplete transactions are not selectable. Historical rows can be kept for reference without changing balances.";
 el("importPreviewBody").innerHTML=pendingRows.map((p,i)=>{
  const t=p.t;
  return '<tr><td><input type="checkbox" data-import-row="'+i+'" '+(p.selected?"checked ":"")+(p.blocked?"disabled ":"")+'aria-label="Import row '+(i+1)+'"></td><td>'+esc(t.date||"—")+'</td><td>'+esc(t.type||"—")+'</td><td>'+esc(t.ticker||"—")+'</td><td>'+formatUnits(t.units)+'</td><td>'+pounds(t.amount)+'</td><td>'+(p.reason.length?'<span class="v13-flag">'+esc(p.reason.join("; "))+'</span>':'Ready')+'</td></tr>';
 }).join("");
}
el("importFileV13").addEventListener("change",async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>4*1024*1024)throw new Error("For now, CSV files must be 4 MB or smaller.");
  const text=await file.text();
  const rows=csvParse(text);
  if(rows.length<2)throw new Error("This file needs a header and at least one transaction.");
  if(rows.length>501)throw new Error("For this version, split files into batches of 500 transactions or fewer.");
  const header=guessHeader(rows);
  csvRowsData=[rows[header],...rows.slice(header+1)];
  csvMap=autoMap(csvRowsData[0]);
  mapControls();
  el("importMapping").hidden=false;
  el("importStatus").textContent="Detected "+csvRowsData[0].length+" columns. Check their meaning before previewing the transactions.";
  el("importStatus").className="v13-status";
  el("importReview").hidden=true;
 }catch(error){el("importStatus").textContent=error.message;el("importStatus").className="v13-status error";el("importMapping").hidden=true;el("importReview").hidden=true;}
});
el("mapImportButton").addEventListener("click",makeImportPreview);
el("confirmImportButton").addEventListener("click",()=>{
 const selected=pendingRows.filter((p,i)=>!p.blocked&&el("importPreviewBody").querySelector('[data-import-row="'+i+'"]')?.checked);
 if(!selected.length){alert("Select at least one valid transaction.");return;}
 const incoming=[];
 let newHoldings=0;
 for(const p of selected){
  const t={...p.t};
  const matching=transactions.some(x=>signature(x)===signature(t))||incoming.some(x=>signature(x)===signature(t));
  if(matching&&!confirm("A selected transaction looks like one you've already imported. Import this potential duplicate anyway?"))continue;
  if(["buy","sell"].includes(t.type)&&!t.holdingId&&!t.historical){
   if(t.type==="sell"){alert("A sale has no matching investment: "+t.ticker+". Importing it as a historical reference only.");t.historical=true;}
   else{
    let h=holdings.find(h=>h.ticker===t.ticker&&h.accountId===t.accountId);
    if(!h){
     h={id:uid(),ticker:t.ticker,name:t.description||t.ticker,accountId:t.accountId,capital:0,accountValue:0,incomeEarned:0,units:0,buy:0,price:t.units?t.amount/t.units:0,quoteDate:t.date,notes:"Created from CSV import",nativeCurrency:"GBP",valuationMode:t.ticker==="VUAG"?"market":"snapshot"};
     baselines[h.id]={...h,snapshotDate:"1970-01-01"};
     holdings.push(h);newHoldings++;
    }
    t.holdingId=h.id;
   }
  }
  if(t.holdingId&&t.type==="sell"&&!t.historical){
   const h=holdings.find(h=>h.id===t.holdingId);
   const available=numeric(h?.units)+incoming.filter(x=>x.holdingId===t.holdingId&&x.type==="buy"&&!x.historical).reduce((s,x)=>s+numeric(x.units),0)-incoming.filter(x=>x.holdingId===t.holdingId&&x.type==="sell"&&!x.historical).reduce((s,x)=>s+numeric(x.units),0);
   if(t.units>available+1e-7){alert("Sale exceeds recorded units for "+t.ticker+"; importing as historical reference only.");t.historical=true;}
  }
  t.fingerprint=signature(t);incoming.push(t);
 }
 if(!incoming.length)return;
 recordTransactions(incoming);
 if(incoming.some(t=>t.ticker==="VUAG"&&!t.historical))refreshPortfolioPrices();
 el("importModal").hidden=true;document.body.style.overflow="";
 el("importFileV13").value="";el("importMapping").hidden=true;el("importReview").hidden=true;
 alert("Imported "+incoming.length+" records"+(newHoldings?" and created "+newHoldings+" investment(s)":"")+". Historical-only records have not changed balances.");
});
function openImportModal(){refreshAccountOptions();el("importModal").hidden=false;document.body.style.overflow="hidden";}
el("openImportModal").addEventListener("click",openImportModal);
el("openImportFromTransactions").addEventListener("click",openImportModal);
el("closeImportModal").addEventListener("click",()=>{el("importModal").hidden=true;document.body.style.overflow="";});
el("importModal").addEventListener("click",e=>{if(e.target.id==="importModal"){el("importModal").hidden=true;document.body.style.overflow="";}});

/* Account and provider fee templates. Estimates never adjust market value. */
function renderAccounts(){
 const feeTotal=accounts.reduce((s,a)=>s+(accountFee(a)||0),0);
 const ocf=holdings.reduce((s,h)=>s+valuation(h)*numeric(h.ocf)/100,0);
 el("feesEstimated").textContent=pounds(feeTotal);
 el("feesFundOcf").textContent=pounds(ocf);
 el("feesActual").textContent=pounds(portfolioMetrics().fees);
 el("accountsList").innerHTML=accounts.map(a=>{
  const fee=accountFee(a);
  return '<div class="v13-row"><div><strong>'+esc(a.name)+'</strong><small>'+esc(a.provider)+' · '+esc(a.kind||"Investment account")+' · Invested assets '+pounds(accountInvestedBalance(a.id))+' · Cash '+pounds(cashFor(a.id))+'</small><small>'+(fee===null?"Account fee template not configured":"Indicative annual provider fees "+pounds(fee))+'</small></div><button class="secondary" type="button" data-account-edit="'+esc(a.id)+'">Edit account</button></div>';
 }).join("");
}
function setFeeTemplateForForm(){
 const p=el("accountProvider").value,kind=el("accountKind").value;
 el("accountFeeModel").value=p!=="Vanguard"?"unconfigured":kind==="Junior ISA"?"vanguard-junior":kind==="Managed ISA"?"vanguard-managed":"vanguard-self";
 toggleCustomFee();
}
function toggleCustomFee(){
 el("customFees").hidden=el("accountFeeModel").value!=="custom";
}
function editAccount(id){
 const a=getAccount(id);
 el("accountEditId").value=a.id;
 el("accountName").value=a.name;
 el("accountProvider").value=a.provider||"Other";
 el("accountKind").value=a.kind||"General account";
 el("accountFeeModel").value=a.feeModel||"unconfigured";
 el("accountFixed").value=a.fixedAnnual??0;
 el("accountRate").value=a.percentAnnual??0;
 el("accountCap").value=a.annualCap??0;
 el("accountOpeningCash").value=a.openingCash??0;
 toggleCustomFee();
 el("accountEditor").hidden=false;el("accountEditor").scrollIntoView({behavior:"smooth",block:"center"});
}
el("newAccountButton").addEventListener("click",()=>{
 el("accountForm").reset();el("accountEditId").value="";
 el("accountFeeModel").value="unconfigured";el("customFees").hidden=true;el("accountEditor").hidden=false;
 el("accountEditor").scrollIntoView({behavior:"smooth",block:"center"});
});
el("cancelAccountEdit").addEventListener("click",()=>el("accountEditor").hidden=true);
el("accountProvider").addEventListener("change",setFeeTemplateForForm);
el("accountKind").addEventListener("change",setFeeTemplateForForm);
el("accountFeeModel").addEventListener("change",toggleCustomFee);
el("accountForm").addEventListener("submit",e=>{
 e.preventDefault();
 const id=el("accountEditId").value||uid(),existing=accounts.find(a=>a.id===id);
 const a={id,name:clean(el("accountName").value),provider:el("accountProvider").value,kind:el("accountKind").value,feeModel:el("accountFeeModel").value,openingCash:parseAmount(el("accountOpeningCash").value),fixedAnnual:Math.max(0,numeric(el("accountFixed").value)),percentAnnual:Math.max(0,numeric(el("accountRate").value)),annualCap:Math.max(0,numeric(el("accountCap").value))};
 if(existing)Object.assign(existing,a);else accounts.push(a);
 saveV13();refreshAccountOptions();el("accountEditor").hidden=true;
});
document.addEventListener("click",e=>{const b=e.target.closest("[data-account-edit]");if(b)editAccount(b.dataset.accountEdit);});

/* Full accounting backup, with backward-compatible import of older holdings-only arrays. */
function downloadBackup(){
 const backup={format:"morrow-backup",version:repoVersion,exportedAt:new Date().toISOString(),holdings,accounts,transactions,baselines,epoch,displayCurrency};
 const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="morrow-full-backup-"+today()+".json";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function restoreBackup(data){
 const isLegacy=Array.isArray(data);
 const rows=isLegacy?data:data?.holdings;
 if(!Array.isArray(rows)||!rows.every(h=>h&&clean(h.ticker)&&h.name))throw new Error("Not a recognised Morrow backup.");
 if(!confirm("Restore this backup? This will replace all current holdings, accounts and transaction records."))return;
 holdings=rows.map(h=>({...h,id:String(h.id||uid()),accountId:h.accountId||"default"}));
 if(isLegacy){
  accounts=[{id:"default",name:"My investment account",provider:"Other",kind:"General account",feeModel:"unconfigured",openingCash:0}];
  transactions=[];baselines=Object.fromEntries(holdings.map(h=>[h.id,{...h,snapshotDate:today()}]));epoch=today();
 }else{
  accounts=Array.isArray(data.accounts)?data.accounts:accounts;
  if(!accounts.some(a=>a.id==="default"))accounts.unshift({id:"default",name:"My investment account",provider:"Other",kind:"General account",feeModel:"unconfigured",openingCash:0});
  transactions=Array.isArray(data.transactions)?data.transactions:[];
  baselines=data.baselines&&typeof data.baselines==="object"?data.baselines:Object.fromEntries(holdings.map(h=>[h.id,{...h,snapshotDate:today()}]));
  epoch=data.epoch||today();
 }
 saveV13();refreshAccountOptions();
 alert("Morrow backup restored.");
}
const oldExport=el("exportButton");const replacement=oldExport.cloneNode(true);oldExport.replaceWith(replacement);
replacement.addEventListener("click",downloadBackup);
const oldRestore=el("importFile"),newRestore=oldRestore.cloneNode(true);oldRestore.replaceWith(newRestore);
newRestore.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{restoreBackup(JSON.parse(await file.text()));}catch(error){alert("Could not restore backup: "+error.message);}e.target.value="";});

/* Price-feed refresh should update calculated holdings, without overwriting snapshot-mode valuations. */
const originalRefresh=refreshPortfolioPrices;
refreshPortfolioPrices=async function(){
 await originalRefresh();
 let changed=false;
 for(const h of holdings){
  if(h.valuationMode==="market"&&numeric(h.units)>0&&numeric(h.price)>0&&(h.nativeCurrency||"GBP")==="GBP"){
   h.accountValue=h.units*h.price;changed=true;
  }
 }
 if(changed){localStorage.setItem(storageKey,JSON.stringify(holdings));renderV13();}
};
const originalReset=resetForm;
resetForm=function(){
 originalReset();
 el("holdingAccount").value="default";
 el("holdingOcf").value="";
 el("autoValue").checked=false;
 el("accountValue").disabled=false;
 el("accountValue").required=true;
 el("newAccountName").value="";
 el("newProvider").value="Other";
 el("newAccountKind").value="Stocks & Shares ISA";
 el("newFeeModel").value="unconfigured";
 el("newAccountFields").hidden=true;
};
showView("investments");
refreshAccountOptions();
renderV13();
})();