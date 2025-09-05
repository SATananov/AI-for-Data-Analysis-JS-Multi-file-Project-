// ===== app.js (pro UI, empty selects by default, smart enabling) =====
const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat('bg-BG');
const fmt2 = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 });

let rawRows = [], headers = [], charts = [];
let fileText = '';
let usedDelimiter = 'auto';

// ---------- helpers ----------
function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent = msg; t.classList.remove('is-hidden'); setTimeout(()=>t.classList.add('is-hidden'), 2200); }
function enableAnalysisUI(on){
  ['catCol','numCol','dateCol','aggFunc'].forEach(id=>{ const el=$('#'+id); if(el) el.disabled=!on; });
  // не активирай Analyze тук – ще го прави validateControls()
}
function enablePostAnalysisUI(on){
  ['btnCharts','btnForecast'].forEach(id=>{ const el=$('#'+id); if(el) el.disabled=!on; });
}
function validateControls(){
  const cat = $('#catCol').value;
  const num = $('#numCol').value;
  const ok = !!cat && !!num;
  $('#btnAnalyze').disabled = !ok;
  if(!ok){ enablePostAnalysisUI(false); }
}
['catCol','numCol','dateCol','aggFunc'].forEach(id=>{
  const el = $('#'+id);
  if(el) el.addEventListener('change', validateControls);
});

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
  // добавяме placeholder опции и НЕ избираме автоматично нищо
  const options = headers.map(h=>`<option value="${h}">${h}</option>`).join('');
  $('#catCol').innerHTML  = `<option value="">— Избери —</option>${options}`;
  $('#numCol').innerHTML  = `<option value="">— Избери —</option>${options}`;
  $('#dateCol').innerHTML = `<option value="">— (по избор) —</option>${options}`;
  $('#aggFunc').value = 'sum';

  // начално състояние: нищо не е избрано
  $('#catCol').value = '';
  $('#numCol').value = '';
  $('#dateCol').value = '';

  validateControls();
}
function kpiCard(label, value){ return `<div class="kpi"><div class="kpi__label">${label}</div><div class="kpi__value">${value}</div></div>`; }
function setSummary(text){
  const box = $('#forecastSummary'); const p = $('#forecastSummaryText');
  if(box && p){ box.classList.remove('is-hidden'); p.textContent = text; }
}
function clearSummary(){ const box=$('#forecastSummary'); if(box){ box.classList.add('is-hidden'); $('#forecastSummaryText').textContent=''; }}

// ---------- FULL RESET ----------
function resetUI(){
  rawRows = []; headers = [];
  charts.forEach(c=>c && c.destroy()); charts = [];
  fileText = ''; usedDelimiter = 'auto';
  window.__analysis = undefined;

  $('#shape').textContent = '—';
  $('#sep').textContent = 'auto';
  $('#preview thead').innerHTML = '';
  $('#preview tbody').innerHTML = '';
  $('#agg thead').innerHTML = '';
  $('#agg tbody').innerHTML = '';
  $('#kpis').innerHTML = '';
  $('#report').value = '';
  const st = $('#status'); if (st) st.textContent = 'Избери CSV файл…';

  // селектите – празни и disabled
  $('#catCol').innerHTML = '<option value="">— Избери —</option>';
  $('#numCol').innerHTML = '<option value="">— Избери —</option>';
  $('#dateCol').innerHTML = '<option value="">— (по избор) —</option>';
  enableAnalysisUI(false);
  $('#btnAnalyze').disabled = true;
  enablePostAnalysisUI(false);

  const fileInput = $('#file'); if (fileInput) fileInput.value = '';
  const sel = $('#delimiterSel'); if (sel) sel.value = 'auto';
  clearSummary();
}
$('#btnReset').onclick = ()=>{
  const sure = confirm('Сигурен ли си, че искаш да започнеш нова сесия? Всички данни и настройки ще бъдат изчистени.');
  if (!sure) return;
  resetUI();
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
async function parseAndLoad(delimChoice){
  if (!fileText){ const st=$('#status'); if(st) st.textContent='Няма зареден файл.'; return; }
  const order = delimChoice === 'auto' ? [',',';','\t','|'] : [delimChoice, ',', ';', '\t', '|'];
  let parsed = null, actualDelim = order[0];

  for(const d of order){
    const res = await parseWithDelimiter(fileText, d);
    const ok = res && res.meta && Array.isArray(res.meta.fields) && res.meta.fields.length > 1;
    if (ok){ parsed = res; actualDelim = d; break; }
  }
  if(!parsed){ parsed = await parseWithDelimiter(fileText, order[0]); }

  if(!parsed || !parsed.meta || !parsed.meta.fields || !parsed.data){
    const st=$('#status'); if(st) st.textContent='Не успях да прочета CSV.'; toast('❗ Неуспешно парсване. Пробвай друг разделител.');
    enableAnalysisUI(false); enablePostAnalysisUI(false); $('#btnAnalyze').disabled = true;
    return;
  }

  headers = parsed.meta.fields;
  rawRows = parsed.data;

  $('#sep').textContent = (delimChoice === 'auto') ? `auto→${actualDelim}` : actualDelim;
  $('#shape').textContent = `${fmt.format(rawRows.length)}×${headers.length}`;
  const st=$('#status'); if(st) st.textContent = `Успешно заредено. Полета: ${headers.length}, редове: ${rawRows.length}`;

  renderPreview();
  fillSelects();           // <- пълни селектите с placeholder най-отгоре
  enableAnalysisUI(true);  // но Analyze си остава disabled, докато не избереш валидни колони
  validateControls();
  enablePostAnalysisUI(false);
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
$('#btnReparse').addEventListener('click', async ()=>{
  if (!fileText){ const st=$('#status'); if(st) st.textContent='Няма зареден файл.'; return; }
  await parseAndLoad(delimSel ? delimSel.value : 'auto');
});

// Демо данни (50 реда, 8 колони)
const DEMO = `Дата,Държава,Град,Категория,Продукт,Цена (лв.),Брой продажби,Клиенти
2019-01,Bulgaria,Sofia,Електроника,Лаптоп,1450,12,10
2019-01,Bulgaria,Plovdiv,Електроника,Мишка,35,80,60
2019-01,Bulgaria,Varna,Електроника,Клавиатура,75,40,35
2019-02,Bulgaria,Sofia,Мебели,Диван,750,6,5
2019-02,Bulgaria,Burgas,Мебели,Стол,120,20,18
2019-02,Bulgaria,Plovdiv,Мебели,Бюро,290,10,8
2019-03,Bulgaria,Sofia,Битова техника,Хладилник,1150,5,5
2019-03,Bulgaria,Varna,Битова техника,Кафемашина,320,15,12
2019-03,Bulgaria,Burgas,Битова техника,Микровълнова печка,270,12,10
2019-04,Bulgaria,Sofia,Електроника,Смартфон,890,25,20
2019-04,Bulgaria,Plovdiv,Електроника,Таблет,650,18,15
2019-04,Bulgaria,Varna,Електроника,Слушалки,120,55,50
2019-05,Bulgaria,Sofia,Мебели,Легло,650,5,4
2019-05,Bulgaria,Burgas,Мебели,Гардероб,850,3,3
2019-05,Bulgaria,Varna,Мебели,Шкаф,400,7,6
2019-06,Bulgaria,Sofia,Битова техника,Пералня,990,4,4
2019-06,Bulgaria,Plovdiv,Битова техника,Фурна,560,8,7
2019-06,Bulgaria,Varna,Битова техника,Прахосмукачка,380,10,9
2019-07,Bulgaria,Sofia,Електроника,Рутер,150,28,25
2019-07,Bulgaria,Plovdiv,Електроника,Флашка,25,150,100
2019-07,Bulgaria,Burgas,Електроника,Външен хард диск,180,20,18
2019-08,Bulgaria,Sofia,Мебели,Килим,220,10,9
2019-08,Bulgaria,Varna,Мебели,Кухненска маса,560,4,4
2019-08,Bulgaria,Plovdiv,Мебели,Фотьойл,480,6,6
2019-09,Bulgaria,Sofia,Битова техника,Блендер,95,15,14
2019-09,Bulgaria,Varna,Битова техника,Сокоизстисквачка,220,12,11
2019-09,Bulgaria,Burgas,Битова техника,Климатиk,1250,3,3
2019-10,Bulgaria,Sofia,Електроника,Дрон,1200,5,4
2019-10,Bulgaria,Plovdiv,Електроника,Фотоапарат,1350,4,4
2019-10,Bulgaria,Varna,Електроника,Конзола за игри,1100,6,5
2019-11,Bulgaria,Sofia,Мебели,Геймърски стол,430,8,7
2019-11,Bulgaria,Plovdiv,Мебели,Етажерка,180,7,6
2019-11,Bulgaria,Burgas,Мебели,Огледало,200,5,4
2019-12,Bulgaria,Sofia,Битова техника,Електрическа кана,65,25,22
2019-12,Bulgaria,Plovdiv,Битова техника,Машина за хляб,230,6,6
2019-12,Bulgaria,Varna,Битова техника,Абажур,80,10,9
2020-01,Bulgaria,Sofia,Електроника,Смарт часовник,390,12,11
2020-01,Bulgaria,Plovdiv,Електроника,Проектор,980,4,4
2020-01,Bulgaria,Burgas,Електроника,Уеб камера,75,30,25
2020-02,Bulgaria,Sofia,Мебели,Писалище,330,5,5
2020-02,Bulgaria,Varna,Мебели,Трапезна маса,720,3,3
2020-02,Bulgaria,Plovdiv,Мебели,Шкаф за обувки,260,4,4
2020-03,Bulgaria,Sofia,Битова техника,Прахоуловител,150,8,7
2020-03,Bulgaria,Burgas,Битова техника,Уред за гладене,130,9,8
2020-03,Bulgaria,Varna,Битова техника,Кафемелачка,180,7,6
2020-04,Bulgaria,Sofia,Електроника,Колонки,210,15,14
2020-04,Bulgaria,Plovdiv,Електроника,Лампа,95,12,11
2020-04,Bulgaria,Varna,Електроника,Абсорбатор,340,6,6`;
$('#btnDemo').addEventListener('click', async ()=>{
  resetUI();
  const st=$('#status'); if(st) st.textContent='Зареждам демо данни…';
  fileText = DEMO;
  await parseAndLoad('auto');
  toast('✅ Заредени са демо данни');
});

// ---------- analyze ----------
$('#btnAnalyze').onclick=()=>{
  const cat=$('#catCol').value, num=$('#numCol').value, date=$('#dateCol').value, aggFunc=$('#aggFunc').value;
  if(!rawRows.length){ alert('Първо зареди CSV.'); return; }
  if(!cat || !num){ alert('Избери категориална и числова колона.'); return; }

  const numeric = rawRows.map(r=>toNumber(r[num])).filter(Number.isFinite);
  const n=numeric.length, mean=n?numeric.reduce((a,b)=>a+b,0)/n:NaN;
  const sd = n>1? Math.sqrt(numeric.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(n-1)) : NaN;
  const min = n? Math.min(...numeric) : NaN;
  const max = n? Math.max(...numeric) : NaN;

  $('#kpis').innerHTML = [
    kpiCard('Брой записи', fmt.format(n)),
    kpiCard('Средна стойност', Number.isFinite(mean)?fmt2.format(mean):'—'),
    kpiCard('Std (n-1)', Number.isFinite(sd)?fmt2.format(sd):'—'),
    kpiCard('Мин / Макс', `${Number.isFinite(min)?fmt2.format(min):'—'} / ${Number.isFinite(max)?fmt2.format(max):'—'}`)
  ].join('');

  const groups={}; 
  rawRows.forEach(r=>{
    const key = r[cat] || '—';
    const val = toNumber(r[num]);
    if(!groups[key]) groups[key] = [];
    if(Number.isFinite(val)) groups[key].push(val);
  });
  const aggRows = Object.entries(groups).map(([k, arr])=>{
    if(aggFunc==='avg') return {k, v: arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0};
    if(aggFunc==='count') return {k, v: arr.length};
    return {k, v: arr.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>b.v-a.v);

  $('#agg thead').innerHTML = `<tr><th>${cat}</th><th>${aggFunc==='sum'?'Сума':aggFunc==='avg'?'Средно':'Брой'}</th></tr>`;
  $('#agg tbody').innerHTML = aggRows.map(r=>`<tr><td>${r.k}</td><td>${fmt2.format(r.v)}</td></tr>`).join('');

  $('#report').value = `Общо ${n} числови стойности.\nФункция: ${aggFunc.toUpperCase()} по "${num}".\nВодеща категория: ${aggRows[0]?.k ?? '—'} (${fmt2.format(aggRows[0]?.v ?? 0)}).`;

  window.__analysis={agg:aggRows,cat,num,date,aggFunc};
  enablePostAnalysisUI(true);
  toast('✅ KPI и агрегация обновени');
};

// ---------- charts ----------
$('#btnCharts').onclick=()=>{
  if(!window.__analysis){ alert('Първо Изчисли KPI.'); return; }
  charts.forEach(c=>c.destroy()); charts=[];
  const { agg, aggFunc } = window.__analysis;
  charts.push(new Chart($('#chart1'),{
    type:'bar',
    data:{labels:agg.map(r=>r.k),datasets:[{label:aggFunc==='sum'?'Сума':aggFunc==='avg'?'Средно':'Брой',data:agg.map(r=>r.v)}]},
    options:{responsive:true,maintainAspectRatio:false}
  }));
  charts.push(new Chart($('#chart2'),{
    type:'line',
    data:{labels:agg.map(r=>r.k),datasets:[{label:aggFunc==='sum'?'Сума':aggFunc==='avg'?'Средно':'Брой',data:agg.map(r=>r.v)}]},
    options:{responsive:true,maintainAspectRatio:false}
  }));
  charts.push(new Chart($('#chart3'),{
    type:'pie',
    data:{labels:agg.map(r=>r.k),datasets:[{data:agg.map(r=>r.v)}]},
    options:{responsive:true,maintainAspectRatio:false}
  }));

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
  toast('📊 Генерирани са визуализации');
};
document.querySelector('[data-download-all]').onclick = ()=>{
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

// ---------- forecast ----------
$('#btnForecast').onclick=()=>{
  const st=window.__analysis; if(!st){ alert('Първо Изчисли KPI.'); return; }
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

  const trend = Math.abs(m) < 1e-6 ? 'равномерен' : (m > 0 ? 'възходящ' : 'низходящ');
  const summary = `Прогноза за "${num}": следваща стойност ≈ ${fmt2.format(forecast)}. Тренд: ${trend}. Надеждност (R²): ${Number.isFinite(r2)?r2.toFixed(3):'N/A'}.`;
  setSummary(summary);

  try {
    if(charts[1]) charts[1].destroy();
    const labels = xs.map(String), fit = xs.map(x=>m*x+b);
    charts[1] = new Chart($('#chart2'),{
      type:'line',
      data:{ labels, datasets:[{label:'Стойности',data:ys,pointRadius:2},{label:'Регресия',data:fit,pointRadius:0}]},
      options:{ responsive:true, scales:{ y:{ beginAtZero:false } }, maintainAspectRatio:false }
    });
  } catch(_){}
  toast('📈 Прогнозата е изчислена');
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

// ---------- init ----------
resetUI(); // гарантира празни селекти при зареждане
