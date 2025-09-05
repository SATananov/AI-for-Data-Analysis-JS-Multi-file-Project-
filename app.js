const $ = s=>document.querySelector(s);
const fmt = new Intl.NumberFormat('bg-BG');
const fmt2 = new Intl.NumberFormat('bg-BG',{maximumFractionDigits:2});
let rawRows=[],headers=[],charts=[];

// Helpers
function toNumber(v){
  if (v==null) return NaN;
  v = String(v).trim();
  if (!v) return NaN;
  v = v.replace('лв.','').replace('лв','').split(' ').join('');
  if (v.includes(',') && !v.includes('.')) v = v.split(',').join('.');
  const lastDot = v.lastIndexOf('.');
  if (lastDot !== -1 && lastDot < v.length-3) v = v.split('.').join('');
  const n = Number(v);
  return Number.isFinite(n)?n:NaN;
}
function linearRegression(xs, ys){
  const n = xs.length; if(n<2) return { m:0,b:0,r2:NaN };
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const mx=mean(xs), my=mean(ys);
  let num=0,denx=0,deny=0;
  for(let i=0;i<n;i++){ const dx=xs[i]-mx, dy=ys[i]-my; num+=dx*dy; denx+=dx*dx; deny+=dy*dy; }
  const m=num/denx; const b=my-m*mx; const r=num/Math.sqrt(denx*deny);
  return { m,b,r2:r*r };
}

// Reset UI
function resetUI(){
  rawRows=[];headers=[];charts.forEach(c=>c.destroy());charts=[];
  $('#sep').textContent='auto';$('#shape').textContent='—';
  $('#preview thead').innerHTML='';$('#preview tbody').innerHTML='';
  $('#agg thead').innerHTML='';$('#agg tbody').innerHTML='';
  $('#kpis').innerHTML='';$('#report').value='';
  const st=$('#status'); if(st) st.textContent='Избери CSV файл…';
  window.__analysis=undefined;
}
$('#btnReset').onclick=resetUI;

// File load
$('#file').addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  if(!file){ const st=$('#status'); if(st) st.textContent='Не е избран файл.'; return; }
  resetUI(); const st=$('#status'); if(st) st.textContent=`Зареждам: ${file.name}…`;

  function sniffDelimiter(text){
    const firstLine=text.split(/\r?\n/)[0]||''; const cand={ ',':0,';':0,'\t':0,'|':0 };
    for(const ch of Object.keys(cand)){ const re=ch==='\\t'?/\\t/g:new RegExp(ch,'g'); cand[ch]=(firstLine.match(re)||[]).length; }
    let best=Object.entries(cand).sort((a,b)=>b[1]-a[1])[0];
    return best&&best[1]>0?(best[0]==='\\t'?'\\t':best[0]):'';
  }
  const sampleText=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result||''));fr.readAsText(file,'UTF-8');});
  const sniffed=sniffDelimiter(sampleText);
  const tryDelims=[sniffed,'','; ',',','\t','|'].filter((v,i,a)=>a.indexOf(v)===i);
  let parsed=null, usedDelim='';
  for(const d of tryDelims){
    await new Promise(r=>{Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:false,encoding:'UTF-8',delimiter:d||'',complete:(r2)=>{parsed=r2;usedDelim=r2?.meta?.delimiter||d||'auto';r();},error:()=>{parsed=null;r();}})});
    if(parsed && parsed.data.length && parsed.meta.fields && parsed.meta.fields.length) break;
  }
  if(!parsed||!parsed.meta||!parsed.meta.fields.length){ if(st) st.textContent='Не успях да открия колони.'; return; }
  headers=parsed.meta.fields; rawRows=parsed.data;
  $('#sep').textContent=usedDelim; $('#shape').textContent=`${fmt.format(rawRows.length)}×${headers.length}`;
  if(st) st.textContent=`Успешно заредено. Разделител: ${usedDelim}`;
  renderPreview(); fillSelects();
});

function renderPreview(){
  $('#preview thead').innerHTML='<tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr>';
  $('#preview tbody').innerHTML=rawRows.slice(0,5).map(r=>`<tr>${headers.map(h=>`<td>${r[h]}</td>`).join('')}</tr>`).join('');
}
function fillSelects(){
  $('#catCol').innerHTML=headers.map(h=>`<option>${h}</option>`).join('');
  $('#numCol').innerHTML=headers.map(h=>`<option>${h}</option>`).join('');
  $('#dateCol').innerHTML='<option></option>'+headers.map(h=>`<option>${h}</option>`).join('');
}

// Analyze
$('#btnAnalyze').onclick=()=>{
  const cat=$('#catCol').value,num=$('#numCol').value,date=$('#dateCol').value;
  if(!rawRows.length){alert('Първо зареди CSV.');return;}
  const vals=rawRows.map(r=>toNumber(r[num])).filter(Number.isFinite);
  const n=vals.length,mean=vals.reduce((a,b)=>a+b,0)/n; const sd=Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(n-1));
  $('#kpis').innerHTML=`<p>Брой: ${n}</p><p>Средна: ${fmt2.format(mean)}</p><p>Std: ${fmt2.format(sd)}</p>`;
  const groups={}; rawRows.forEach(r=>{const k=r[cat]||'—'; const v=toNumber(r[num]); if(Number.isFinite(v)) groups[k]=(groups[k]||0)+v;});
  const agg=Object.entries(groups).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  $('#agg thead').innerHTML='<tr><th>'+cat+'</th><th>Сума</th></tr>';
  $('#agg tbody').innerHTML=agg.map(r=>`<tr><td>${r.k}</td><td>${fmt2.format(r.v)}</td></tr>`).join('');
  $('#report').value=`Общо ${n} реда. Средна стойност: ${fmt2.format(mean)}. Най-висока категория: ${agg[0]?.k??'—'}.`;
  window.__analysis={agg,cat,num,date};
};

// Charts
$('#btnCharts').onclick=()=>{
  if(!window.__analysis)return;
  charts.forEach(c=>c.destroy());charts=[];
  const {agg,cat}=window.__analysis;
  charts.push(new Chart($('#chart1'),{type:'bar',data:{labels:agg.map(r=>r.k),datasets:[{label:'Сума',data:agg.map(r=>r.v)}]}}));
  charts.push(new Chart($('#chart2'),{type:'line',data:{labels:agg.map(r=>r.k),datasets:[{label:'Сума',data:agg.map(r=>r.v)}]}}));
  charts.push(new Chart($('#chart3'),{type:'pie',data:{labels:agg.map(r=>r.k),datasets:[{data:agg.map(r=>r.v)}]}}));
};
$('[data-download-chart]').onclick=()=>{if(!charts[0])return;const url=charts[0].toBase64Image();const a=document.createElement('a');a.href=url;a.download='chart.png';a.click();};
$('[data-download-all]').onclick=()=>{if(!charts.length)return;charts.forEach((ch,i)=>{if(!ch)return;const url=ch.toBase64Image();const a=document.createElement('a');a.href=url;a.download=`chart_${i+1}.png`;a.click();});};

// Forecast
$('#btnForecast').onclick=()=>{
  const st=window.__analysis;if(!st){alert('Първо Анализирай.');return;}
  const num=st.num,dateCol=st.date;
  let series=[]; if(dateCol){ series=rawRows.map(r=>({t:Date.parse(r[dateCol]),y:toNumber(r[num])})).filter(o=>Number.isFinite(o.t)&&Number.isFinite(o.y)).sort((a,b)=>a.t-b.t).map((o,i)=>({x:i,y:o.y})); }
  else { series=rawRows.map((r,i)=>({x:i,y:toNumber(r[num])})).filter(o=>Number.isFinite(o.y)); }
  if(series.length<4){alert('Трябват поне 4 наблюдения.');return;}
  const xs=series.map(p=>p.x),ys=series.map(p=>p.y); const {m,b,r2}=linearRegression(xs,ys);
  const nextX=xs[xs.length-1]+1; const forecast=m*nextX+b;
  const line=`\\n\\nПрогноза (линейна регресия) по \"${num}\":\\n• Следваща стойност: ${fmt2.format(forecast)}\\n• m: ${m.toFixed(4)}, b: ${b.toFixed(4)}, R²: ${Number.isFinite(r2)?r2.toFixed(3):'N/A'}`+(dateCol?`\\n• Времева колона: ${dateCol}`:'\\n• Използван е индекс');
  $('#report').value=($('#report').value?$('#report').value+line:line);
  try{ if(charts[1]) charts[1].destroy(); const labels=xs.map(String), fit=xs.map(x=>m*x+b); charts[1]=new Chart($('#chart2'),{type:'line',data:{labels,datasets:[{label:'Стойности',data:ys,pointRadius:2},{label:'Регресия',data:fit,pointRadius:0}]},options:{responsive:true,scales:{y:{beginAtZero:false}}}}); }catch(_){}
};

// Export TXT
$('#btnExport').onclick=()=>{const blob=new Blob([$('#report').value||'—'],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-Report.txt';a.click();};
// Export XLSX
$('#btnExportXlsx').onclick=()=>{try{if(!window.XLSX){alert('XLSX библиотеката не е заредена.');return;}if(!rawRows.length){alert('Първо зареди CSV.');return;}const cat=$('#catCol').value,num=$('#numCol').value,date=$('#dateCol').value;const vals=rawRows.map(r=>toNumber(r[num])).filter(Number.isFinite);const n=vals.length,mean=n?vals.reduce((a,b)=>a+b,0)/n:NaN,sd=n>1?Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(n-1)):NaN;const min=Math.min(...vals),max=Math.max(...vals);const groups={};rawRows.forEach(r=>{const k=r[cat]||'—';const v=toNumber(r[num]);if(Number.isFinite(v))groups[k]=(groups[k]||0)+v;});const agg=Object.entries(groups).map(([k,v])=>({[cat]:k,Sum:v})).sort((a,b)=>b.Sum-a.Sum);const wb=XLSX.utils.book_new();const summaryAOA=[['Поле','Стойност'],['Категориална',cat||'—'],['Числова',num||'—'],['Дата',date||'—'],['Брой записи',n],['Средна',mean],['Std (n-1)',sd],['Мин',min],['Макс',max]];const wsSummary=XLSX.utils.aoa_to_sheet(summaryAOA);XLSX.utils.book_append_sheet(wb,wsSummary,'Summary');const aggAOA=[[cat||'Категория','Сума']].concat(agg.map(r=>[r[cat],r.Sum]));const wsAgg=XLSX.utils.aoa_to_sheet(aggAOA);XLSX.utils.book_append_sheet(wb,wsAgg,'Aggregation');const rawAOA=[headers].concat(rawRows.map(r=>headers.map(h=>r[h])));const wsRaw=XLSX.utils.aoa_to_sheet(rawAOA);XLSX.utils.book_append_sheet(wb,wsRaw,'Raw');XLSX.writeFile(wb,'AI-Data-Analysis.xlsx');}catch(e){console.error(e);alert('Грешка при експорт в Excel.');}};\n```
