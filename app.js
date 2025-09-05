// ===== app.js (stable, with manual delimiter + small charts + per-chart downloads) =====
const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat('bg-BG');
const fmt2 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 });

let rawRows = [], headers = [], charts = [];
let fileText = '';         // последно зареденият CSV текст
let usedDelimiter = 'auto';

// ---------- helpers ----------
function toNumber(v){
  if (v == null) return NaN;
  v = String(v).trim();
  if (!v) return NaN;
  v = v.replace('лв.','').replace('лв','').split('\u00A0').join('').split(' ').join('');
  if (v.includes(',') && !v.includes('.')) v = v.replaceAll(',', '.');
  const lastDot = v.lastIndexOf('.');
  if (lastDot !== -1 && lastDot < v.length - 3) v = v.replaceAll('.', '');
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function linearRegression(xs, ys){
  const n = xs.length; if (n < 2) return { m:0, b:0, r2: NaN };
  const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
  const mx = mean(xs), my = mean(ys);
  let num=0, denx=0, deny=0;
  for(let i=0;i<n;i++){ const dx=xs[i]-mx, dy=ys[i]-my; num+=dx*dy; denx+=dx*dx; deny+=dy*dy; }
  const m = num/denx, b = my - m*mx, r = num/Math.sqrt(denx*deny);
  return { m, b, r2: r*r };
}
function renderPreview(){
  $('#preview thead').innerHTML = '<tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr>';
  $('#preview tbody').innerHTML = rawRows.slice(0, 8)
    .map(r => `<tr>${headers.map(h=>`<td>${r[h]}</td>`).join('')}</tr>`).join('');
}
function fillSelects(){
  $('#catCol').innerHTML = headers.map(h=>`<option>${h}</option>`).join('');
  $('#numCol').innerHTML = headers.map(h=>`<option>${h}</option>`).join('');
  $('#dateCol').innerHTML = '<option></option>' + headers.map(h=>`<option>${h}</option>`).join('');
}
function resetUI(){
  rawRows=[]; headers=[]; charts.forEach(c=>c.destroy()); charts=[];
  $('#shape').textContent = '—'; $('#sep').textContent = usedDelimiter || 'auto';
  $('#preview thead').innerHTML=''; $('#preview tbody').innerHTML='';
  $('#agg thead').innerHTML=''; $('#agg tbody').innerHTML='';
  $('#kpis').innerHTML=''; $('#report').value='';
  const st = $('#status'); if(st) st.textContent = 'Избери CSV файл…';
  window.__analysis = undefined;
}
$('#btnReset').onclick = ()=>{
  fileText = '';
  usedDelimiter = 'auto';
  resetUI();
  const sel = $('#delimiterSel'); if(sel) sel.value = 'auto';
};

// ---------- parsing core ----------
async function parseWithDelimiter(text, delim){
  return new Promise(resolve=>{
    Papa.parse(text, {
      header: true, skipEmptyLines: true, delimiter: delim,
      complete: r => resolve(r),
      error: () => resolve(null)
    });
  });
}

/**
 * Парсира fileText с избрания разделител.
 * - 'auto' пробва последователно: ',' -> ';' -> '\t' -> '|'
 * - ако е избран конкретен знак, опитва него, после fallback към останалите, докато намери поне 2 колони.
 */
async function parseAndLoad(delimChoice){
  if (!fileText){ const st=$('#status'); if(st) st.textContent='Няма зареден файл.'; return; }

  const order = delimChoice === 'auto'
    ? [',',';','\t','|']
    : [delimChoice, ',', ';', '\t', '|'];

  let parsed = null, actualDelim = order[0];

  for(const d of order){
    const res = await parseWithDelimiter(fileText, d);
    const ok = res && res.meta && Array.isArray(res.meta.fields) && res.meta.fields.length > 1;
    if (ok){ parsed = res; actualDelim = d; break; }
  }
  // последен шанс: приемаме и 1 колона, за да покажем състояние
  if(!parsed){
    const res = await parseWithDelimiter(fileText, order[0]);
    parsed = res;
  }

  if(!parsed || !parsed.meta || !parsed.meta.fields || !parsed.data){
    const st=$('#status'); if(st) st.textContent='Не успях да прочета CSV.';
    return;
  }

  headers = parsed.meta.fields;
  rawRows = parsed.data;

  usedDelimiter = (delimChoice === 'auto') ? `auto→${actualDelim}` : actualDelim;
  $('#sep').textContent = usedDelimiter;
  $('#shape').textContent = `${fmt.format(rawRows.length)}×${headers.length}`;
  const st=$('#status'); if(st) st.textContent = `Успешно заредено. Полета: ${headers.length}, редове: ${rawRows.length}`;

  renderPreview();
  fillSelects();
}

// ---------- events ----------
$('#file').addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file){ const st=$('#status'); if(st) st.textContent='Не е избран файл.'; return; }
  const st=$('#status'); if(st) st.textContent=`Чета: ${file.name}…`;
  fileText = await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result||'')); fr.readAsText(file,'UTF-8'); });
  await parseAndLoad($('#delimiterSel') ? $('#delimiterSel').value : 'auto');
});
const delimSel = $('#delimiterSel');
if(delimSel){
  delimSel.addEventListener('change', async ()=>{
    if (!fileText) return;
    await parseAndLoad(delimSel.value);
  });
}
const btnReparse = $('#btnReparse');
if(btnReparse){
  btnReparse.addEventListener('click', async ()=>{
    if (!fileText){ const st=$('#status'); if(st) st.textContent='Няма зареден файл.'; return; }
    await parseAndLoad(delimSel ? delimSel.value : 'auto');
  });
}

// ---------- analyze ----------
$('#btnAnalyze').onclick=()=>{
  const cat=$('#catCol').value, num=$('#numCol').value, date=$('#dateCol').value;
  if(!rawRows.length){ alert('Първо зареди CSV.'); return; }
  if(!cat || !num){ alert('Избери категориална и числова колона.'); return; }

  const vals=rawRows.map(r=>toNumber(r[num])).filter(Number.isFinite);
  const n=vals.length, mean=n?vals.reduce((a,b)=>a+b,0)/n:NaN;
  const sd = n>1? Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(n-1)) : NaN;
  $('#kpis').innerHTML=`<p>Брой: ${n}</p><p>Средна: ${fmt2.format(mean)}</p><p>Std: ${fmt2.format(sd)}</p>`;

  const groups={}; rawRows.forEach(r=>{ const k=r[cat]||'—'; const v=toNumber(r[num]); if(Number.isFinite(v)) groups[k]=(groups[k]||0)+v; });
  const agg=Object.entries(groups).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  $('#agg thead').innerHTML='<tr><th>'+cat+'</th><th>Сума</th></tr>';
  $('#agg tbody').innerHTML=agg.map(r=>`<tr><td>${r.k}</td><td>${fmt2.format(r.v)}</td></tr>`).join('');
  $('#report').value=`Общо ${n} реда. Средна стойност: ${fmt2.format(mean)}. Най-висока категория: ${agg[0]?.k ?? '—'}.`;

  window.__analysis={agg,cat,num,date};
};

// ---------- charts ----------
$('#btnCharts').onclick=()=>{
  if(!window.__analysis){ alert('Първо Анализирай.'); return; }
  charts.forEach(c=>c.destroy()); charts=[];
  const { agg } = window.__analysis;
  charts.push(new Chart($('#chart1'),{type:'bar',data:{labels:agg.map(r=>r.k),datasets:[{label:'Сума',data:agg.map(r=>r.v)}]}}));
  charts.push(new Chart($('#chart2'),{type:'line',data:{labels:agg.map(r=>r.k),datasets:[{label:'Сума',data:agg.map(r=>r.v)}]}}));
  charts.push(new Chart($('#chart3'),{type:'pie',data:{labels:agg.map(r=>r.k),datasets:[{data:agg.map(r=>r.v)}]}}));

  // вързваме бутоните под всяка графика
  document.querySelectorAll('[data-download]').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = Number(btn.getAttribute('data-download'))-1;
      if(!charts[idx]) return;
      const url = charts[idx].toBase64Image();
      const a=document.createElement('a');
      a.href=url;
      a.download=`chart_${idx+1}.png`;
      a.click();
    };
  });
};
// сваляне на всички
const allBtn = document.querySelector('[data-download-all]');
if(allBtn){
  allBtn.onclick = ()=>{
    if(!charts.length) return;
    charts.forEach((ch,i)=>{
      if(!ch) return;
      const url=ch.toBase64Image();
      const a=document.createElement('a');
      a.href=url;
      a.download=`chart_${i+1}.png`;
      a.click();
    });
  };
}

// ---------- forecast ----------
$('#btnForecast').onclick=()=>{
  const st=window.__analysis; if(!st){ alert('Първо Анализирай.'); return; }
  const num=st.num, dateCol=st.date;
  let series=[];
  if(dateCol){
    series=rawRows.map(r=>({t:Date.parse(r[dateCol]),y:toNumber(r[num])}))
      .filter(o=>Number.isFinite(o.t)&&Number.isFinite(o.y))
      .sort((a,b)=>a.t-b.t).map((o,i)=>({x:i,y:o.y}));
  } else {
    series=rawRows.map((r,i)=>({x:i,y:toNumber(r[num])})).filter(o=>Number.isFinite(o.y));
  }
  if(series.length<4){ alert('Трябват поне 4 наблюдения.'); return; }
  const xs=series.map(p=>p.x), ys=series.map(p=>p.y);
  const { m,b,r2 } = linearRegression(xs,ys);
  const nextX = xs[xs.length-1]+1; const forecast = m*nextX+b;
  const line = `\n\nПрогноза (линейна регресия) по "${num}":\n• Следваща стойност: ${fmt2.format(forecast)}\n• m: ${m.toFixed(4)}, b: ${b.toFixed(4)}, R²: ${Number.isFinite(r2)?r2.toFixed(3):'N/A'}` + (dateCol?`\n• Времева колона: ${dateCol}`:'\n• Използван е индекс');
  $('#report').value = ($('#report').value ? $('#report').value + line : line);

  try {
    if(charts[1]) charts[1].destroy();
    const labels = xs.map(String), fit = xs.map(x=>m*x+b);
    charts[1] = new Chart($('#chart2'),{
      type:'line',
      data:{ labels, datasets:[{label:'Стойности',data:ys,pointRadius:2},{label:'Регресия',data:fit,pointRadius:0}]},
      options:{ responsive:true, scales:{ y:{ beginAtZero:false } } }
    });
  } catch(_){}
};

// ---------- export ----------
$('#btnExport').onclick=()=>{
  const blob=new Blob([$('#report').value||'—'],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='AI-Report.txt'; a.click();
};
$('#btnExportXlsx').onclick=()=>{
  try{
    if(!window.XLSX){ alert('XLSX библиотеката не е заредена.'); return; }
    if(!rawRows.length){ alert('Първо зареди CSV.'); return; }
    const cat=$('#catCol').value, num=$('#numCol').value, date=$('#dateCol').value;
    const vals=rawRows.map(r=>toNumber(r[num])).filter(Number.isFinite);
    const n=vals.length, mean=n?vals.reduce((a,b)=>a+b,0)/n:NaN, sd=n>1?Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(n-1)):NaN;
    const min=Math.min(...vals), max=Math.max(...vals);
    const groups={}; rawRows.forEach(r=>{ const k=r[cat]||'—'; const v=toNumber(r[num]); if(Number.isFinite(v)) groups[k]=(groups[k]||0)+v; });
    const agg=Object.entries(groups).map(([k,v])=>({[cat]:k,Sum:v})).sort((a,b)=>b.Sum-a.Sum);

    const wb=XLSX.utils.book_new();
    const summaryAOA=[['Поле','Стойност'],['Категориална',cat||'—'],['Числова',num||'—'],['Дата',date||'—'],['Брой записи',n],['Средна',mean],['Std (n-1)',sd],['Мин',min],['Макс',max]];
    const wsSummary=XLSX.utils.aoa_to_sheet(summaryAOA); XLSX.utils.book_append_sheet(wb,wsSummary,'Summary');

    const aggAOA=[[cat||'Категория','Сума']].concat(agg.map(r=>[r[cat],r.Sum]));
    const wsAgg=XLSX.utils.aoa_to_sheet(aggAOA); XLSX.utils.book_append_sheet(wb,wsAgg,'Aggregation');

    const rawAOA=[headers].concat(rawRows.map(r=>headers.map(h=>r[h])));
    const wsRaw=XLSX.utils.aoa_to_sheet(rawAOA); XLSX.utils.book_append_sheet(wb,wsRaw,'Raw');

    XLSX.writeFile(wb,'AI-Data-Analysis.xlsx');
  }catch(e){ console.error(e); alert('Грешка при експорт в Excel.'); }
};
