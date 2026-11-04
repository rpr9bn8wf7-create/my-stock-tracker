/* Vanguard UK report parser. Runs in-browser; no user report is sent to GitHub or Morrow's backend.
   Requires SheetJS browser runtime (XLSX) for .xls/.xlsx. No customer-specific sample records are bundled. */
(function(root){
 "use strict";
 const str=v=>String(v??"").trim();
 const num=v=>{if(typeof v==="number")return v;const n=Number(str(v).replace(/[£,\s]/g,""));return Number.isFinite(n)?n:NaN;};
 const round2=v=>Math.round((v+Number.EPSILON)*100)/100;
 function dateOf(v){
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
  if(typeof v==="number"&&v>20000&&v<90000){
   const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000);
   return d.toISOString().slice(0,10);
  }
  const s=str(v);
  if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  return "";
 }
 const days=(a,b)=>Math.abs((Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000);
 const tickerOf=s=>{const m=str(s).match(/\(([A-Z0-9.:-]{2,15})\)/);return m?m[1]:"";};
 const isRow=(r,name)=>str(r[0]).toLowerCase()===name.toLowerCase();
 function parseArray(rows,sourceName){
  const cashTitle=rows.findIndex(r=>isRow(r,"Cash Transactions"));
  const investmentTitle=rows.findIndex(r=>isRow(r,"Investment Transactions"));
  if(cashTitle<0||investmentTitle<0||investmentTitle<=cashTitle)throw new Error("This doesn't look like a Vanguard UK Client Transactions Listing. It needs both Cash Transactions and Investment Transactions sections.");
  const cashHeader=rows.findIndex((r,i)=>i>cashTitle&&i<investmentTitle&&str(r[0]).toLowerCase()==="date"&&str(r[1]).toLowerCase()==="details");
  const invHeader=rows.findIndex((r,i)=>i>investmentTitle&&str(r[0]).toLowerCase()==="date"&&str(r[1]).toLowerCase()==="investmentname");
  if(cashHeader<0||invHeader<0)throw new Error("Vanguard's transaction column headings have changed. No transactions were imported.");
  const cash=[];
  for(let i=cashHeader+1;i<investmentTitle;i++){
   const row=rows[i],date=dateOf(row[0]),details=str(row[1]),amount=num(row[2]),balance=num(row[3]);
   if(!date||!Number.isFinite(amount)||!details)continue;
   cash.push({date,details,amount,balance,row:i+1,matched:false});
  }
  const investments=[];
  for(let i=invHeader+1;i<rows.length;i++){
   const row=rows[i],date=dateOf(row[0]),name=str(row[1]),description=str(row[2]),quantity=num(row[3]),unitPrice=num(row[4]),cost=num(row[5]);
   if(!date||!name||!Number.isFinite(quantity)||!Number.isFinite(cost))continue;
   const ticker=tickerOf(name)||tickerOf(description);
   const type=/^bought\b/i.test(description)?"buy":/^sold\b/i.test(description)?"sell":"transfer_in";
   investments.push({date,name,description,quantity,unitPrice,cost,type,ticker,row:i+1});
  }
  if(!cash.length||!investments.length)throw new Error("No usable cash or investment entries were found in this Vanguard statement.");
  const issues=[],items=[];
  const reportSource="Vanguard UK";
  function add(type,date,amount,notes,opts={}){
   items.push({type,date,amount:round2(Math.abs(amount)),units:0,price:0,ticker:"",description:notes,reference:"",source:reportSource,warning:"",selected:true,...opts});
  }
  const trades=[];
  for(const inv of investments){
   if(!inv.ticker){issues.push("Investment row "+inv.row+" has no ticker and needs review.");continue;}
   if(inv.type==="transfer_in"){
    // Some older positions appear without a purchase description or matching cash movement.
    add("transfer_in",inv.date,Math.abs(inv.cost),inv.name,{units:Math.abs(inv.quantity),price:inv.unitPrice,ticker:inv.ticker,warning:"Unlabelled investment entry — POSSIBLE transfer in. Confirm before including.",selected:false});
    continue;
   }
   const candidates=cash.map((c,i)=>({c,i})).filter(({c})=>{
    const cashType=/^bought\b/i.test(c.details)?"buy":/^sold\b/i.test(c.details)?"sell":"";
    const count=Number((c.details.match(/^(?:Bought|Sold)\s+([\d.]+)/i)||[])[1]||0);
    return !c.matched&&cashType===inv.type&&
     Math.abs(Math.abs(c.amount)-Math.abs(inv.cost))<=0.035&&
     (count===0||Math.abs(count-Math.abs(inv.quantity))<0.000001)&&
     days(c.date,inv.date)<=14;
   }).sort((a,b)=>days(a.c.date,inv.date)-days(b.c.date));
   if(candidates.length===1||candidates.length>1&&days(candidates[0].c.date,inv.date)<days(candidates[1].c.date,inv.date)){
    const matched=candidates[0].c;matched.matched=true;
    trades.push({type:inv.type,date:matched.date,amount:round2(Math.abs(matched.amount)),ticker:inv.ticker,units:Math.abs(inv.quantity),price:inv.unitPrice,description:inv.description,source:reportSource,reference:"",warning:"",selected:true});
   }else{
    issues.push("Could not uniquely pair investment row "+inv.row+" ("+inv.ticker+", "+round2(Math.abs(inv.cost))+") with cash activity.");
    trades.push({type:inv.type,date:inv.date,amount:round2(Math.abs(inv.cost)),ticker:inv.ticker,units:Math.abs(inv.quantity),price:inv.unitPrice,description:inv.description,source:reportSource,reference:"",warning:"Unmatched investment trade — review cash movement before including.",selected:false});
   }
  }
  for(const c of cash){
   if(c.matched)continue;
   const d=c.details.toLowerCase();
   if(/^bought\b|^sold\b/.test(d)){
    issues.push("Unmatched cash trade on "+c.date+" for "+round2(Math.abs(c.amount))+".");
    continue;
   }
   let type="";
   if(/deposit|direct credit|payment in|cash transfer in/.test(d))type="deposit";
   else if(/withdrawal|payment by faster|payment out/.test(d))type="withdrawal";
   else if(/interest/.test(d))type="interest";
   else if(/account fee|fee for|commission|charge/.test(d))type="fee";
   else if(/dividend|distribution/.test(d))type="dividend";
   if(!type){issues.push("Unknown cash activity on "+c.date+": "+c.details.slice(0,85));continue;}
   add(type,c.date,Math.abs(c.amount),c.details);
  }
  items.push(...trades);
  items.sort((a,b)=>a.date.localeCompare(b.date)||(["deposit","transfer_in","buy","sell","interest","dividend","fee","withdrawal"].indexOf(a.type)-["deposit","transfer_in","buy","sell","interest","dividend","fee","withdrawal"].indexOf(b.type)));
  const first=cash[0],last=cash[cash.length-1];
  const opening=round2(first.balance-first.amount);
  const closing=round2(last.balance);
  const balance=round2(opening+cash.reduce((s,c)=>s+c.amount,0));
  const balanced=Math.abs(balance-closing)<0.025;
  if(!balanced)issues.push("Cash balances do not reconcile; check the statement before building history.");
  const matched=trades.filter(t=>!t.warning).length;
  const missing=items.filter(t=>t.warning).length;
  return {kind:"vanguard",name:sourceName,items,cashRows:cash.length,investmentRows:investments.length,matched,unresolved:missing,issues,openingCash:opening,closingCash:closing,computedCash:balance,cashBalanced:balanced};
 }
 async function parseWorkbook(file){
  if(!root.XLSX)throw new Error("The spreadsheet reader could not load. Check your connection and reload Morrow.");
  const buffer=await file.arrayBuffer(),wb=root.XLSX.read(buffer,{type:"array",cellDates:false});
  for(const name of wb.SheetNames){
   const rows=root.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
   if(rows.some(r=>isRow(r,"Cash Transactions"))&&rows.some(r=>isRow(r,"Investment Transactions")))return parseArray(rows,file.name);
  }
  throw new Error("The workbook contains no combined Vanguard cash and investment transaction worksheet.");
 }
 root.MorrowVanguard={parseWorkbook,parseArray};
})(window);
