/* Vanguard UK Excel/CSV import experience. Uses the local parser and Morrow's accounting bridge. */
(function(){
 "use strict";
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const pounds=n=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n)||0);
 let report=null,pending=[];
 function status(msg,kind=""){
  $("importStatus").textContent=msg;
  $("importStatus").className="v13-status "+kind;
 }
 function showReport(r){
  report=r;
  $("importProvider").value="vanguard";
  $("vanguardControls").hidden=false;
  $("importMapping").hidden=true;
  $("importReview").hidden=true;
  $("vanguardMode").value="snapshot";
  $("vanguardReportStatus").textContent=r.cashRows+" cash entries and "+r.investmentRows+" investment entries identified. "+r.matched+" trades paired with cash entries. "+r.unresolved+" investment entries need review.";
  $("vanguardReconciliation").textContent="Opening cash "+pounds(r.openingCash)+" · Closing cash "+pounds(r.closingCash)+" · Recalculated cash "+pounds(r.computedCash)+(r.cashBalanced?" · Reconciles":" · Does not reconcile");
  $("vanguardReconciliation").className="v13-status "+(r.cashBalanced?"ok":"error");
  status("Vanguard UK report recognised. Review "+r.issues.length+" potential issue(s) before importing.",r.issues.length?"warning":"ok");
 }
 $("importFileV13").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))return;
  let rows=null;
  if(/\.csv$/i.test(file.name)){
   // Generic CSV continues through the existing importer. Only take ownership of a
   // recognizable Vanguard report containing both transaction sections.
   const text=await file.text();
   const row=[],all=[];let cell="",quoted=false;
   for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===","&&!quoted){row.push(cell);cell="";}
    else if((c==="\n"||c==="\r")&&!quoted){
     if(c==="\r"&&text[i+1]==="\n")i++;
     row.push(cell);if(row.some(v=>String(v).trim()))all.push([...row]);row.length=0;cell="";
    }else cell+=c;
   }
   row.push(cell);if(row.some(v=>String(v).trim()))all.push(row);
   if(!all.some(r=>String(r[0]).trim().toLowerCase()==="cash transactions")||!all.some(r=>String(r[0]).trim().toLowerCase()==="investment transactions"))return;
   rows=all;
  }
  // Capture before generic CSV processing, preventing mixed table data from being interpreted as one table.
  e.stopImmediatePropagation();
  try{
   if(file.size>4*1024*1024)throw Error("For now, Vanguard reports must be smaller than 4 MB.");
   if(!window.MorrowVanguard)throw Error("The Vanguard parser could not load. Refresh the page.");
   const r=rows?window.MorrowVanguard.parseArray(rows,file.name):await window.MorrowVanguard.parseWorkbook(file);
   showReport(r);
  }catch(err){
   report=null;$("vanguardControls").hidden=true;$("importReview").hidden=true;
   status("Vanguard import error: "+err.message,"error");
  }
 },true);
 $("importProvider").addEventListener("change",()=>{if(report&&$("importProvider").value!=="vanguard"){report=null;$("vanguardControls").hidden=true;$("importReview").hidden=true;}});
 $("vanguardMode").addEventListener("change",()=>{$("importReview").hidden=true;});
 function preview(){
  if(!report)return;
  const mode=$("vanguardMode").value,accountId=window.MorrowVanguardBridge.accountId();
  pending=[];const seen=new Set();
  const existing=window.MorrowVanguardBridge.existing();
  for(const r of report.items){
   const t={date:r.date,type:r.type,ticker:r.ticker||"",amount:r.amount,units:r.units||0,price:r.price||0,description:r.description||"",reference:"",historical:false,holdingId:""};
   const sig=[t.date,t.type,t.ticker,Number(t.amount).toFixed(2),Number(t.units).toFixed(6),accountId].join("|");
   const duplicate=seen.has(sig)||existing.some(v=>[v.date,v.type,v.ticker||"",Number(v.amount).toFixed(2),Number(v.units).toFixed(6),v.accountId].join("|")===sig);
   seen.add(sig);
   if(mode==="snapshot"&&(t.type==="transfer_in"||t.date<=window.MorrowVanguardBridge.snapshot(accountId,t.ticker)))t.historical=true;
   const reasons=[r.warning,...(duplicate?["Possible duplicate"]:[]),...(t.historical?["Before snapshot — reference only"]:[])].filter(Boolean);
   pending.push({t,selected:!!r.selected&&!duplicate,reason:reasons});
  }
  $("importReview").hidden=false;
  $("importSummary").textContent="Matched trades appear once, not as separate cash and investment duplicates. Unlabelled investments are unchecked by default. "+
    report.issues.slice(0,3).join(" ").slice(0,600);
  $("importPreviewBody").innerHTML=pending.map((p,i)=>{
   const t=p.t;
   return '<tr><td><input type="checkbox" data-vanguard-row="'+i+'" '+(p.selected?"checked ":"")+'aria-label="Include transaction '+(i+1)+'"></td><td>'+esc(t.date)+'</td><td>'+esc(t.type.replace("_"," "))+'</td><td>'+esc(t.ticker||"—")+'</td><td>'+esc(t.units||"—")+'</td><td>'+pounds(t.amount)+'</td><td>'+(p.reason.length?'<span class="v13-flag">'+esc(p.reason.join("; "))+'</span>':'Ready')+'</td></tr>';
  }).join("");
  status(pending.length+" Vanguard transactions ready to review. "+report.issues.length+" potential issue(s).",report.issues.length?"warning":"ok");
 }
 $("reviewVanguard").addEventListener("click",preview);
 $("confirmImportButton").addEventListener("click",e=>{
  if(!report)return;
  e.stopImmediatePropagation();
  const selected=pending.filter((p,i)=>$("importPreviewBody").querySelector('[data-vanguard-row="'+i+'"]')?.checked).map(p=>p.t);
  try{
   if($("vanguardMode").value==="rebuild"&&report.items.some(r=>r.type==="transfer_in")&&!selected.some(t=>t.type==="transfer_in")){
    if(!confirm("An unlabelled investment record may be a transfer into Vanguard. You have not selected it, so unit totals may be wrong. Continue?"))return;
   }
   const success=window.MorrowVanguardBridge.commit(report,selected,$("vanguardMode").value);
   if(!success)return;
   $("importModal").hidden=true;document.body.style.overflow="";
   $("importFileV13").value="";$("vanguardControls").hidden=true;$("importReview").hidden=true;report=null;pending=[];
   alert("Vanguard report imported. Review the holdings and current market value. The transaction report does not by itself provide a live market valuation.");
  }catch(err){status(err.message,"error");alert(err.message);}
 },true);
})();
