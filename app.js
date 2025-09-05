const $ = s=>document.querySelector(s);
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
