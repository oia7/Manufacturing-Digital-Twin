import {FactoryTwin, RECIPES, MACHINES, SHIFT_SECONDS, lifecycleCase} from './model.js';

const twin = new FactoryTwin(151122);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const number = n => Math.round(n).toLocaleString('en-US');
const money = n => '$'+Math.round(n).toLocaleString('en-US');
const pct = n => (n*100).toFixed(1)+'%';
const safe = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = seconds => {
  const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=Math.floor(seconds%60);
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');
};
let toastTimer=null;
function toast(msg){
  const el=$('#toast'); el.textContent=msg;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2700);
}

function updateStation(machine) {
  const el=$(`[data-station="${machine.key}"]`);
  if(!el) return;
  const health=Math.round(machine.health), wear=Math.round(machine.wear);
  const status=el.querySelector('.station-state');
  status.textContent=machine.state;
  status.className='station-state '+machine.state.toLowerCase();
  el.querySelector('.station-data').innerHTML=`<span>Health <b>${health}%</b></span><span>Wear <b>${wear}</b></span>`;
  const p=el.querySelector('.station-track-fill');
  p.style.width=health+'%';
  p.className='station-track-fill '+(machine.state==='TRIPPED'||machine.state==='DOWN'?'down':wear>70?'warn':'');
  el.querySelector('.station-sensors').innerHTML=`<span>♨ <b>${machine.temperature.toFixed(1)}</b> °C</span><span>≋ <b>${machine.vibration.toFixed(1)}</b> mm/s</span>`;
  el.title=`${machine.name}: ${machine.state}. Cycle completion ${Math.round(machine.progress)}%; projected maintenance ${machine.eta.toFixed(1)} h.`;
}

function renderMetrics(s){
  $('#m-oee').innerHTML=`${(s.oee*100).toFixed(1)}<span>%</span>`;
  $('#m-good').textContent=number(s.good);
  $('#m-yield').innerHTML=`${(s.quality*100).toFixed(1)}<span>%</span>`;
  $('#m-forecast').innerHTML=`${number(s.forecast.nextShiftGood)}<span> units</span>`;
  $('#m-rate').textContent=s.rate.toFixed(1)+' units/hr';
  $('#m-scrap').textContent=number(s.scrap)+' rejected units';
  $('#m-target').textContent=(s.forecast.delta>=0?'+':'')+number(s.forecast.delta)+' vs target';
  $('#m-target').className='mini-pill'+(s.forecast.delta<0?' bad':' aqua');
  $('#m-oee-status').textContent=s.elapsed<120?'Warming up':s.oee>=.85?'Strong modeled OEE':s.oee>=.65?'Developing output':'Below benchmark';
  $('#m-oee-status').title='Benchmark is a heuristic reference; startup, line design and planned time must be considered.';
  $('#oee-progress').style.width=Math.max(0,Math.min(100,s.oee*100))+'%';
  $('#yield-progress').style.width=Math.max(0,Math.min(100,s.quality*100))+'%';
  $('#forecast-progress').style.width=Math.max(0,Math.min(100,s.forecast.nextShiftGood/s.target*100))+'%';
  $('#stock-value').textContent=number(s.material);
  $('#recipe-label').textContent='Rev '+s.revision;
  $('#buffer-a').innerHTML=s.buffers[0]+' <small>/ 8</small>';
  $('#buffer-b').innerHTML=s.buffers[1]+' <small>/ 8</small>';
  $('#buffer-c').innerHTML=s.buffers[2]+' <small>/ 8</small>';
  $('#wip-count').textContent=s.wip;
  const bins=twin.history.slice(-28).map((h,i,arr)=>{
    const previous=i?arr[i-1].good:Math.max(0,h.good-1);
    return Math.max(1,h.good-previous);
  });
  const max=Math.max(1,...bins);
  $('#unit-sparkline').innerHTML=bins.map(v=>`<i style="height:${Math.max(3,Math.round(6*v/max))}px"></i>`).join('');
}

function renderRecommendations(){
  $('#insight-feed').innerHTML=twin.insights().map(i=>`
    <div class="insight-card ${safe(i.tone)}"><div class="insight-icon">${({wrench:'⚙',package:'▤',scan:'⌗',chart:'↗',layers:'◇',check:'✓'})[i.icon]||'◈'}</div><div class="insight-main"><h3>${safe(i.title)}</h3><p>${safe(i.desc)}</p><button class="insight-action" data-insight="${safe(i.key)}" data-value="${safe(i.value||'')}">${safe(i.action)} →</button></div></div>
  `).join('');
}

function renderEquipment(s){
  $('#equipment-table').innerHTML=s.machines.map(m=>{
    const condition=m.state.toLowerCase();
    const wearClass=m.wear>=85?'veryhigh':m.wear>=70?'high':'';
    return `<tr><td><strong>${safe(m.code)} · ${safe(m.name)}</strong><small>${safe(m.type)}</small></td>
      <td><span class="condition-badge ${safe(condition)}">${safe(m.state)}</span></td>
      <td><div class="mini-wear"><span><i class="${wearClass}" style="width:${Math.min(m.wear,100)}%"></i></span>${m.wear.toFixed(1)}</div></td>
      <td>${m.temperature.toFixed(1)} °C</td><td>${m.vibration.toFixed(1)} mm/s</td>
      <td style="color:${m.eta<=2?'#f9bd6e':'#9bcdd3'}">${m.eta<=0?'SERVICE NOW':m.eta.toFixed(1)+' h'}</td></tr>`;
  }).join('');
}

let lastEventId='';
function renderEvents(){
  if(twin.events[0]?.id===lastEventId)return;
  lastEventId=twin.events[0]?.id||'';
  $('#event-list').innerHTML=twin.events.slice(0,9).map(e=>`
    <article class="event-item"><span class="event-marker ${safe(e.severity)}"></span><div><h3>${safe(e.title)}</h3><p>${safe(e.detail)}</p><time>${clock(e.time)} · SIMULATED</time></div></article>
  `).join('');
}

function renderRevisions(){
  const demand=twin.lifecycleHorizon, cost=twin.redesignCost;
  const a=lifecycleCase('A',demand),b=lifecycleCase('B',demand);
  for(const r of [a,b]){
    const k=r.revision.toLowerCase();
    $(`#rev-${r.revision}`).classList.toggle('active',twin.revision===r.revision);
    $(`#rev-${k}-badge`).textContent=twin.revision===r.revision?'ACTIVE':'ALTERNATIVE';
    $(`#rev-${k}-yield`).textContent=pct(r.yield);
    $(`#rev-${k}-warranty`).textContent=pct(r.warranty);
    $(`#rev-${k}-profit`).textContent=money(r.contribution-(r.revision==='B'?cost:0));
    $(`[data-rev="${r.revision}"]`).textContent=twin.revision===r.revision?'Current recipe ✓':`Release Rev ${r.revision} →`;
    $(`[data-rev="${r.revision}"]`).disabled=twin.revision===r.revision;
  }
  const delta=b.contribution-a.contribution-cost;
  const perGood=b.contributionPerGood-a.contributionPerGood;
  const breakEven=perGood>0?Math.ceil(cost/perGood):Infinity;
  $('#lifecycle-title').textContent=(delta>=0?`Rev B advantage: ${money(delta)}`:`Rev A advantage: ${money(-delta)}`)+` over ${number(demand)} good units`;
  $('#lifecycle-copy').textContent=`${number(Math.round(a.scrap-b.scrap))} fewer expected rejects, ${number(Math.round(a.expectedClaims-b.expectedClaims))} fewer expected warranty cases. Redesign payback threshold: ${Number.isFinite(breakEven)?number(breakEven)+' good units':'not reached'}.`;
}

function renderStatus(s){
  $('#sim-time').textContent=clock(s.elapsed);
  $('#status-label').textContent=s.running?'SIMULATION ACTIVE':'SIMULATION PAUSED';
  $('#status-dot').classList.toggle('paused',!s.running);
  $('#run-btn').textContent=s.running?'Ⅱ Pause twin':'▶ Resume twin';
  $('#pace-value').textContent=Math.round(s.pace*100)+'%';
  $('#target-value').textContent=number(s.target)+' units';
}

function chart(canvas, lines, maxY, threshold=null, labelMode='numeric') {
  const r=canvas.getBoundingClientRect();if(r.width<10)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=r.width,h=r.height;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const left=37,right=w-12,top=12,bottom=h-27,pw=right-left,ph=bottom-top;
  g.lineWidth=1;g.font='10px ui-monospace, monospace';g.fillStyle='#7f98b0';
  for(let k=0;k<=4;k++){
    const val=maxY*k/4,y=bottom-ph*k/4;
    g.strokeStyle='#294056';g.beginPath();g.moveTo(left,y+.5);g.lineTo(right,y+.5);g.stroke();
    g.textAlign='right';g.fillText(labelMode==='percentage'?Math.round(val)+'%':Math.round(val),left-8,y+3);
  }
  const span=Math.max(1,lines[0]?.data?.length-1||1);
  for(let k=0;k<=4;k++){
    const x=left+pw*k/4;
    g.textAlign=k===0?'left':k===4?'right':'center';
    g.fillText('-'+Math.round((span-span*k/4))+'m',x,bottom+17);
  }
  if(threshold!=null){
    const y=bottom-ph*threshold/maxY;
    g.setLineDash([5,5]);g.strokeStyle='#f8b96b99';g.beginPath();g.moveTo(left,y);g.lineTo(right,y);g.stroke();g.setLineDash([]);
  }
  for(const line of lines){
    if(line.data.length===0)continue;
    const xs=line.data;
    g.beginPath();g.lineWidth=2;g.strokeStyle=line.color;
    for(let i=0;i<xs.length;i++){
      const x=left+pw*(i/Math.max(1,xs.length-1));
      const y=bottom-ph*Math.min(1,Math.max(0,xs[i]/maxY));
      i?g.lineTo(x,y):g.moveTo(x,y);
    }
    g.stroke();
    const x=right,y=bottom-ph*Math.min(1,Math.max(0,xs[xs.length-1]/maxY));
    g.beginPath();g.arc(x,y,3,0,2*Math.PI);g.fillStyle=line.color;g.fill();
  }
}

let lastPlotAt=-1;
function renderPlots(force=false){
  const rows=twin.history;
  if(!force && lastPlotAt===rows.at(-1)?.t)return;
  lastPlotAt=rows.at(-1)?.t;
  const rate=rows.map(r=>r.rate),max=Math.max(120,Math.ceil(Math.max(...rate,twin.target/8)/20)*20);
  chart($('#throughput-chart'),[{data:rate,color:'#48cde7'}],max,twin.target/8);
  chart($('#wear-chart'),[
    {data:rows.map(x=>x.cncWear),color:'#79adf8'},
    {data:rows.map(x=>x.assemblyWear),color:'#f9bd6e'},
    {data:rows.map(x=>x.inspectionWear),color:'#b19aff'},
    {data:rows.map(x=>x.packagingWear),color:'#5adabf'},
  ],100,85,'percentage');
}

function render(){
  const s=twin.snapshot();renderStatus(s);renderMetrics(s);
  s.machines.forEach(updateStation);
  renderRecommendations();renderEquipment(s);renderEvents();renderRevisions();renderPlots();
}

function csv(rows,fields){
  function cell(x){const s=String(x??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  return [fields.map(cell).join(','),...rows.map(row=>fields.map(k=>cell(row[k])).join(','))].join('\r\n');
}
function saveCsv(name,data){
  const url=URL.createObjectURL(new Blob(['\uFEFF',data],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportRecords(){
  twin.record();const fields=Object.keys(twin.history[0]);
  saveCsv('forge-manufacturing-telemetry.csv',csv(twin.history,fields));
  toast('Production telemetry exported as CSV');
}
function exportEvents(){
  saveCsv('forge-activity-log.csv',csv([...twin.events].reverse().map(e=>({simulated_time:clock(e.time),severity:e.severity,title:e.title,detail:e.detail})),['simulated_time','severity','title','detail']));
  toast('Machine event log exported as CSV');
}

$('#run-btn').addEventListener('click',()=>{twin.running=!twin.running;toast(twin.running?'Twin resumed':'Twin paused');render();});
$('#reset-btn').addEventListener('click',()=>{
  twin.reset(151122);$('#pace-range').value='100';$('#target-range').value='570';$('#speed-select').value='60';
  $('#horizon-select').value='25000';$('#nre-select').value='50000';
  lastPlotAt=-1;lastEventId='';toast('Simulation reset to baseline');render();
});
$('#speed-select').addEventListener('change',e=>{twin.speed=Number(e.target.value);toast('Time acceleration set to '+twin.speed+'×');render();});
$('#pace-range').addEventListener('input',e=>{twin.setPace(Number(e.target.value)/100);render();});
$('#target-range').addEventListener('input',e=>{twin.setTarget(Number(e.target.value));render();});
function updateLifecycleScenario(){twin.setLifecycleScenario(Number($('#horizon-select').value),Number($('#nre-select').value));render();}
$('#horizon-select').addEventListener('change',updateLifecycleScenario);
$('#nre-select').addEventListener('change',updateLifecycleScenario);
$('#restock-btn').addEventListener('click',()=>{twin.replenish();toast('500 raw kits received');render();});
$('#service-btn').addEventListener('click',()=>{
  const key=$('#machine-select').value;
  if(twin.maintain(key))toast('Maintenance scheduled for '+key);
  else toast('Machine is already being serviced');render();
});
$$('.fault-btn').forEach(btn=>btn.addEventListener('click',()=>{
  if(twin.inject(btn.dataset.fault))toast('Scenario injected: '+btn.textContent.trim());
  else toast('Fault is already active');render();
}));
$$('.btn-revision').forEach(btn=>btn.addEventListener('click',()=>{twin.setRevision(btn.dataset.rev);toast('Revision '+btn.dataset.rev+' released for new production');render();}));
$('#insight-feed').addEventListener('click',e=>{
  const btn=e.target.closest('[data-insight]');if(!btn)return;
  if(btn.dataset.insight==='maintenance'){twin.maintain(btn.dataset.value);toast('Service scheduled for '+btn.dataset.value);}
  if(btn.dataset.insight==='replenish'){twin.replenish();toast('Raw stock replenished');}
  if(btn.dataset.insight==='revision'){twin.setRevision(btn.dataset.value);toast('Revision B released');}
  if(btn.dataset.insight==='focus'){const sel=btn.dataset.value==='pace'?'#pace-range':btn.dataset.value==='lifecycle'?'#lifecycle':'#analytics';document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'});}
  render();
});
$$('.station').forEach(card=>card.addEventListener('click',()=>{
  $$('.station').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');
  const m=twin.machines.find(x=>x.key===card.dataset.station);
  $('#machine-select').value=m.key;
  toast(`${m.code}: ${m.fault||'Operational'} · estimated service in ${twin.machineForecast(m).hours.toFixed(1)}h`);
}));
$('#export-btn').addEventListener('click',exportRecords);
$('#events-export').addEventListener('click',exportEvents);
window.addEventListener('resize',()=>renderPlots(true));

let secondsCarry=0;
setInterval(()=>{
  if(twin.running){
    secondsCarry+=twin.speed/4;
    const n=Math.floor(secondsCarry);
    if(n>0){twin.step(n);secondsCarry-=n;}
  }
  render();
},250);
render();
