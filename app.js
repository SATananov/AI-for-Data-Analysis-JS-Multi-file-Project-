const $ = s=>document.querySelector(s);
const fmt = new Intl.NumberFormat('bg-BG');
const fmt2 = new Intl.NumberFormat('bg-BG',{maximumFractionDigits:2});
let rawRows=[],headers=[],charts=[];


// Helpers (no regex needed)
function toNumber(v){
if (v==null) return NaN;
v = String(v).trim();
if (!v) return NaN;
v = v.replace('лв.','');
v = v.replace('лв','');
v = v.split(' ').join('');
try { v = v.split(' ').join(''); } catch(_){}
if (v.includes(',') && !v.includes('.')) v = v.split(',').join('.');
const lastDot = v.lastIndexOf('.');
if (lastDot !== -1 && lastDot < v.length-3) v = v.split('.').join('');
const n = Number(v);
return Number.isFinite(n) ? n : NaN;
}
function linearRegression(xs, ys){
const n = xs.length; if (n<2) return { m:0, b:0, r2:NaN };
const sum = a => a.reduce((s,v)=>s+v,0);
const mean = a => sum(a)/a.length;
const mx = mean(xs), my = mean(ys);
let num=0, denx=0, deny=0;
for (let i=0;i<n;i++){
const dx = xs[i]-mx, dy = ys[i]-my;
num += dx*dy; denx += dx*dx; deny += dy*dy;
}
const m = num/denx;
const b = my - m*mx;
const r = num / Math.sqrt(denx*deny);
return { m, b, r2: r*r };
}
function toNumber(v){


const groups = {};
rawRows.forEach(r=>{ const k = r[cat] || '—'; const v = toNumber(r[num]); if(Number.isFinite(v)) groups[k]=(groups[k]||0)+v; });
const agg = Object.entries(groups).map(([k,v])=>({[cat]:k, Sum:v})).sort((a,b)=>b.Sum-a.Sum);


const wb = XLSX.utils.book_new();


const summaryAOA = [
['Поле','Стойност'],
['Категориална', cat || '—'],
['Числова', num || '—'],
['Дата', date || '—'],
['Брой записи', n],
['Средна стойност', Number.isFinite(mean)? mean : '—'],
['Std (n-1)', Number.isFinite(sd)? sd : '—'],
['Мин', Number.isFinite(min)? min : '—'],
['Макс', Number.isFinite(max)? max : '—']
];
const wsSummary = XLSX.utils.aoa_to_sheet(summaryAOA);
XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');


const aggAOA = [[cat || 'Категория','Сума']].concat(agg.map(r=>[r[cat], r.Sum]));
const wsAgg = XLSX.utils.aoa_to_sheet(aggAOA);
XLSX.utils.book_append_sheet(wb, wsAgg, 'Aggregation');


const rawAOA = [headers].concat(rawRows.map(r=>headers.map(h=>r[h])));
const wsRaw = XLSX.utils.aoa_to_sheet(rawAOA);
XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw');


XLSX.writeFile(wb, 'AI-Data-Analysis.xlsx');
}catch(e){
console.error(e);
alert('Грешка при експорт в Excel.');
}
};


// ===== Export to Excel (XLSX) =====
function exportExcel(){
if(!window.__analysis){ alert('Първо Анализирай.'); return; }
const rows=[[window.__analysis.cat,'Сума']].concat(window.__analysis.agg.map(r=>[r.k,r.v]));
let csv=rows.map(r=>r.join(',')).join('
');
const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-Export.csv';a.click();
}


// ===== Export all charts =====
function exportAllCharts(){
if(!charts.length){ alert('Няма графики.'); return; }
charts.forEach((c,i)=>{
const url=c.toBase64Image();
const a=document.createElement('a');a.href=url;a.download=`chart${i+1}.png`;a.click();
});
}


// Extra buttons injection
document.addEventListener('DOMContentLoaded',()=>{
const sec=document.querySelector('section:nth-of-type(4) h2');
if(sec){
const btnX=document.createElement('button');btnX.textContent='Експорт Excel';btnX.onclick=exportExcel;sec.after(btnX);
const btnC=document.createElement('button');btnC.textContent='Свали всички графики';btnC.onclick=exportAllCharts;sec.after(btnC);
}
});
