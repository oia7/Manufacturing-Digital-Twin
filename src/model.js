/**
 * FORGE / Digital Twin – deterministic, standalone manufacturing-line emulator.
 * This is a simulated plant with virtual telemetry, NOT an instrumented physical twin.
 * All factory parameters, cost inputs, and thresholds are illustrative assumptions.
 */

export const SHIFT_SECONDS = 8 * 3600;
export const MAX_EVENTS = 180;
export const RECIPES = Object.freeze({
  A: Object.freeze({
    name: 'Core Valve · Rev A', version: 'A', material: 37.8, salesPrice: 89,
    processing: 10.2, defect: 0.036, warranty: 0.028, warrantyCost: 42,
    cycleFactor: 1, color: '#7fb2ff', note: 'Baseline design · standard tolerance',
  }),
  B: Object.freeze({
    name: 'Core Valve · Rev B', version: 'B', material: 42.4, salesPrice: 95,
    processing: 9.6, defect: 0.015, warranty: 0.012, warrantyCost: 42,
    cycleFactor: 0.94, color: '#53d8c2', note: 'Revised seal geometry · improved tolerance',
  }),
});

export const MACHINES = Object.freeze([
  { key:'cnc', name:'CNC machining', code:'M-01', stage:'01', cycle:32, baseTemp:49, baseVib:1.7, power:8.0, wearRate:0.0024, initialWear:29, type:'PRECISION CUTTING' },
  { key:'assembly', name:'Robotic assembly', code:'M-02', stage:'02', cycle:43, baseTemp:41, baseVib:2.0, power:4.2, wearRate:0.0031, initialWear:38, type:'VALVE ASSEMBLY' },
  { key:'inspection', name:'Vision inspection', code:'M-03', stage:'03', cycle:36, baseTemp:35, baseVib:0.8, power:3.0, wearRate:0.0015, initialWear:17, type:'QUALITY ASSURANCE' },
  { key:'packaging', name:'Final packaging', code:'M-04', stage:'04', cycle:25, baseTemp:31, baseVib:0.9, power:2.3, wearRate:0.0019, initialWear:23, type:'FINISHED GOODS' },
]);

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const r1 = n => Math.round(n * 10) / 10;
const mean = values => values.reduce((a,b) => a+b,0) / (values.length || 1);
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lifecycleCase(rev, demand=10000) {
  if (!RECIPES[rev]) throw new RangeError('Unknown product revision');
  if (!Number.isFinite(demand) || demand <= 0) throw new RangeError('Demand must be positive');
  const p = RECIPES[rev];
  // Model assumes demand is shipped GOOD units; failed inspections consume materials and processing.
  const started = demand / (1 - p.defect);
  const scrap = started - demand;
  const grossRevenue = demand * p.salesPrice;
  const materialAndConversion = started * (p.material + p.processing);
  const expectedWarranty = demand * p.warranty * p.warrantyCost;
  const contribution = grossRevenue - materialAndConversion - expectedWarranty;
  return {
    revision:rev, demand, started, scrap, yield:1 - p.defect,
    grossRevenue, materialAndConversion, expectedWarranty, contribution,
    contributionPerGood: contribution / demand,
    expectedClaims: demand * p.warranty,
    salesPrice:p.salesPrice, defect:p.defect, warranty:p.warranty,
  };
}

function normalizeMachine(c) {
  return {
    ...c,
    wear:c.initialWear, temp:c.baseTemp, vibration:c.baseVib,
    active:null, down:0, locked:false, fault:null, maintenance:false,
    completed:0, runSeconds:0, downSeconds:0, idleSeconds:0, blockedSeconds:0,
  };
}

export class FactoryTwin {
  constructor(seed=221197) { this.reset(seed); }

  reset(seed=this.seed ?? 221197) {
    this.seed=seed; this.random=seededRandom(seed);
    this.elapsed=0; this.running=true; this.speed=60;
    this.revision='A'; this.pace=1; this.target=570;
    this.lifecycleHorizon=25000; this.redesignCost=50000;
    this.material=1200; this.unitsStarted=0; this.good=0; this.scrap=0;
    this.goodRev={A:0,B:0}; this.scrapRev={A:0,B:0};
    this.energyKwh=0;
    this.buffers=[[],[],[]]; this.machines=MACHINES.map(normalizeMachine);
    this.unitsSeq=0; this.history=[]; this.shipments=[]; this.events=[];
    this.faults={cooling:false,bearing:false,vision:false,supply:0,packaging:0};
    this.addEvent('info','Digital twin initialized','Plant emulator online · four workstations');
    this.record();
    return this;
  }

  addEvent(severity, title, detail) {
    this.events.unshift({id:`${this.elapsed}-${++this.unitsSeq}`,time:this.elapsed,severity,title,detail});
    if(this.events.length>MAX_EVENTS) this.events.length=MAX_EVENTS;
  }

  setRevision(rev) {
    if(!RECIPES[rev]) throw new RangeError('Unknown revision');
    if(rev!==this.revision){this.revision=rev;this.addEvent('success',`Revision ${rev} released`,'New work orders now use the updated production recipe');}
  }

  setPace(value) {
    if(!Number.isFinite(value)) throw new TypeError('Invalid production pace');
    const next=clamp(value,0.7,1.3);
    if(Math.abs(next-this.pace)>0.001){this.pace=next;this.addEvent('info','Line speed adjusted',`${Math.round(next*100)}% of nominal cycle speed`);}
  }

  setLifecycleScenario(horizon, redesignCost) {
    if(!Number.isInteger(horizon)||horizon<100||horizon>1000000) throw new RangeError('Invalid shipment horizon');
    if(!Number.isFinite(redesignCost)||redesignCost<0||redesignCost>10000000) throw new RangeError('Invalid redesign cost');
    this.lifecycleHorizon=horizon;this.redesignCost=redesignCost;
  }

  setTarget(value){
    if(!Number.isFinite(value)) throw new TypeError('Invalid target');
    this.target=clamp(Math.round(value),200,1000);
  }

  replenish(count=500) {
    if(!Number.isInteger(count)||count<1||count>5000) throw new RangeError('Invalid replenishment quantity');
    this.material+=count;
    this.faults.supply=0;
    this.addEvent('success','Material received',`${count} kits added to raw material stock`);
  }

  inject(type) {
    if(type==='cooling') {
      if(this.faults.cooling) return false;
      this.faults.cooling=true;
      this.addEvent('critical','Cooling circuit failure','M-01 temperature is now climbing toward the safety limit');
    } else if(type==='bearing') {
      if(this.faults.bearing) return false;
      this.faults.bearing=true;
      this.addEvent('warning','Bearing vibration anomaly','M-02 vibration and wear are increasing');
    } else if(type==='vision') {
      if(this.faults.vision) return false;
      this.faults.vision=true;
      this.addEvent('warning','Vision calibration drift','M-03 expected scrap rate increased; calibration required');
    } else if(type==='packaging') {
      if(this.machines[3].down>0 || this.machines[3].locked) return false;
      this.machines[3].down=240; this.machines[3].fault='Conveyor jam';
      this.faults.packaging=240;
      this.addEvent('critical','Packaging conveyor jam','M-04 stopped for 240 simulated seconds');
    } else if(type==='supply') {
      if(this.faults.supply>0) return false;
      this.material=0; this.faults.supply=420;
      this.addEvent('warning','Supplier delivery disruption','No raw kits available; emergency delivery ETA 7 simulated minutes');
    } else throw new RangeError('Unknown fault type');
    return true;
  }

  maintain(key) {
    const m=this.machines.find(x=>x.key===key);
    if(!m) throw new RangeError('Unknown machine');
    if(m.maintenance) return false;
    m.maintenance=true; m.locked=false; m.down=180; m.fault='Preventive maintenance';
    m.wear=9; m.temp=m.baseTemp+3; m.vibration=m.baseVib;
    if(key==='cnc') this.faults.cooling=false;
    if(key==='assembly') this.faults.bearing=false;
    if(key==='inspection') this.faults.vision=false;
    this.addEvent('success',`Maintenance ordered · ${m.code}`,'180 simulated seconds · wear and active fault reset');
    return true;
  }

  stationCycle(m, rev=this.revision) {
    const recipe=RECIPES[rev];
    const revisionFactor = m.key==='assembly' ? recipe.cycleFactor : 1;
    return m.cycle * revisionFactor / this.pace;
  }

  _tick() {
    this.elapsed++;
    if(this.faults.supply>0) {
      this.faults.supply--;
      if(this.faults.supply===0){this.material+=500;this.addEvent('success','Supplier delivery arrived','500 raw kits restored to stock');}
    }

    for(const m of this.machines) {
      if(m.down>0) {
        m.down--; m.downSeconds++;
        if(m.down===0){
          const was=m.fault;
          m.fault=null; m.maintenance=false;
          if(was==='Conveyor jam') this.addEvent('success','Packaging line restarted','M-04 conveyor cleared');
          else if(was==='Preventive maintenance') this.addEvent('success',`Maintenance complete · ${m.code}`,'Machine available for production');
        }
      } else if(m.locked){m.downSeconds++;}
      else if(m.active){
        m.active.remaining--;
        m.runSeconds++;
        let wearFactor=this.pace>1 ? 1+(this.pace-1)*2 : 1;
        if(m.key==='assembly' && this.faults.bearing) wearFactor*=4;
        m.wear=clamp(m.wear+m.wearRate*wearFactor,0,110);
        this.energyKwh+=m.power/3600*(this.pace>1?1+(this.pace-1)*0.36:1);
      } else { m.idleSeconds++; this.energyKwh+=m.power*0.08/3600; }
      const faultTemp=(m.key==='cnc'&&this.faults.cooling)?57:0;
      const faultVib=(m.key==='assembly'&&this.faults.bearing)?6.3:0;
      const tempGoal=m.baseTemp+(m.active?5:0)+m.wear*.14+faultTemp;
      const vibGoal=m.baseVib+m.wear*.019+faultVib;
      m.temp+=(tempGoal-m.temp)*.03;
      m.vibration+=(vibGoal-m.vibration)*.06;
      if(!m.locked&&!m.maintenance && m.down===0){
        if(m.wear>=100 || (m.key==='cnc'&&m.temp>=83) || (m.key==='assembly'&&m.vibration>=7.8)) {
          m.locked=true;
          m.fault=m.wear>=100?'Wear limit reached':m.key==='cnc'?'Overtemperature trip':'Vibration trip';
          this.addEvent('critical',`Safety interlock · ${m.code}`,`${m.fault}. Schedule maintenance to restore the station.`);
        }
      }
    }

    // Complete downstream first. This permits physically valid flow without overfilling buffers.
    for(let i=this.machines.length-1;i>=0;i--){
      const m=this.machines[i];
      if(!m.active || m.down>0 || m.locked || m.active.remaining>0) continue;
      if(i<3 && this.buffers[i].length>=8){m.blockedSeconds++;continue;}
      const job=m.active; m.active=null; m.completed++;
      if(i===2){
        const p=this.defectProbability(job.revision);
        if(this.random()<p){
          this.scrap++; this.scrapRev[job.revision]++;
          continue;
        }
      }
      if(i===3){this.good++;this.goodRev[job.revision]++;this.shipments.push(this.elapsed);}
      else this.buffers[i].push(job);
    }

    // Load from downstream buffers; a unit always belongs to exactly one location.
    for(let i=this.machines.length-1;i>=0;i--){
      const m=this.machines[i];
      if(m.active || m.down>0 || m.locked) continue;
      let job;
      if(i===0) {
        if(this.material<=0 || this.faults.supply>0) continue;
        this.material--; this.unitsStarted++;
        job={id:this.unitsStarted,revision:this.revision};
      } else {
        if(!this.buffers[i-1].length) continue;
        job=this.buffers[i-1].shift();
      }
      m.active={...job,remaining:Math.max(1,Math.ceil(this.stationCycle(m,job.revision)))};
    }
    if(this.elapsed%60===0) this.record();
  }

  step(seconds=1) {
    if(!Number.isInteger(seconds)||seconds<0||seconds>10000) throw new RangeError('Invalid simulated seconds');
    if(this.running) for(let i=0;i<seconds;i++) this._tick();
    return this.snapshot();
  }

  defectProbability(rev=this.revision){
    const wear=this.machines[2].wear;
    const excessWear=Math.max(0,wear-55)*.00048;
    const fastPace=Math.max(0,this.pace-1)*.045;
    return clamp(RECIPES[rev].defect + excessWear + fastPace +(this.faults.vision?.095:0),0,.75);
  }

  get wip(){return this.machines.filter(m=>m.active).length+this.buffers.reduce((n,b)=>n+b.length,0);}
  get theoreticalRate(){return 3600/Math.max(...this.machines.map(m=>this.stationCycle(m)));}
  get rollingRate(){
    if(this.elapsed<=0) return 0;
    const window=Math.min(600,this.elapsed);
    let recent=0;
    for(let j=this.shipments.length-1;j>=0;j--) {
      if(this.shipments[j]>this.elapsed-window) recent++; else break;
    }
    return recent*3600/window;
  }
  get availability(){
    if(this.elapsed===0) return 1;
    return clamp(1-this.machines.reduce((n,m)=>n+m.downSeconds,0)/(this.machines.length*this.elapsed),0,1);
  }
  get yieldRate(){return (this.good+this.scrap)?this.good/(this.good+this.scrap):1;}
  get performance(){
    if(this.elapsed<=0) return 0;
    const rated=this.elapsed*this.theoreticalRate/3600*this.availability;
    return clamp((this.good+this.scrap)/(rated || 1),0,1);
  }
  get oee(){return this.availability*this.performance*this.yieldRate;}

  machineForecast(m) {
    const wearFactor=this.pace>1?1+(this.pace-1)*2:1;
    const accel=m.key==='assembly'&&this.faults.bearing?4:1;
    const idleFactor=m.runSeconds>30 ? clamp(m.runSeconds/Math.max(this.elapsed-m.downSeconds,1),.35,1):.75;
    const rate=m.wearRate*wearFactor*accel*idleFactor;
    let hours=rate>0?Math.max(0,(85-m.wear)/rate)/3600:Infinity;
    if(m.locked)hours=0;
    return { key:m.key,code:m.code,hours,wear:r1(m.wear),status:m.locked?'trip':hours<=.5?'critical':hours<=2?'warning':'normal' };
  }

  forecast(){
    const shiftsLeft=SHIFT_SECONDS;
    const baseOutput=this.theoreticalRate*shiftsLeft/3600;
    const tripped=this.machines.some(m=>m.locked);
    const downtime=tripped?0:(this.availability < .995 ? this.availability : .965); // assumed baseline availability
    const quality=1-this.defectProbability();
    const supplyAvailable=this.material+(this.faults.supply>0?500:0)+this.wip;
    // No-intervention estimate: hard trips halt line output; material stock caps shipped units.
    const projection=Math.max(0,Math.round(Math.min(baseOutput*downtime*quality*.98,supplyAvailable*quality)));
    const risks=this.machines.map(m=>this.machineForecast(m)).sort((a,b)=>a.hours-b.hours);
    const bottleneck=this.machines.reduce((a,b)=>this.stationCycle(a)>=this.stationCycle(b)?a:b);
    return {
      nextShiftGood:projection, target:this.target, delta:projection-this.target,
      lineCapacityPerHour:r1(this.theoreticalRate),
      projectedYield:quality, downtimeFactor:downtime,
      risks, nextMaintenance:risks[0], bottleneck:bottleneck.code,
    };
  }

  insights(){
    const f=this.forecast();
    const items=[];
    if(f.nextMaintenance.hours<2 || this.machines.some(m=>m.locked)) {
      const m=this.machines.find(x=>x.key===f.nextMaintenance.key);
      items.push({tone:'critical',icon:'wrench',title:`Service ${m.code} before the next shift`,desc:`Projected service threshold ${f.nextMaintenance.hours.toFixed(1)} h away · ${m.name}.`,action:`Maintain ${m.code}`,key:'maintenance',value:m.key});
    }
    if(this.material<100 || this.faults.supply>0){
      items.push({tone:'warning',icon:'package',title:'Replenish raw material',desc:`Only ${this.material} kits available. Input starvation can reduce line throughput.`,action:'Receive 500 kits',key:'replenish'});
    }
    if(this.faults.vision){
      items.push({tone:'warning',icon:'scan',title:'Inspection calibration needed',desc:'Vision drift has increased expected scrap probability.',action:'Calibrate M-03',key:'maintenance',value:'inspection'});
    }
    if(f.delta<0) {
      items.push({tone:'warning',icon:'chart',title:'Next-shift target at risk',desc:`Heuristic output estimate is ${-f.delta} good units below the ${this.target}-unit goal.`,action:'Review line pace',key:'focus',value:'pace'});
    }
    const a=lifecycleCase('A',this.lifecycleHorizon), b=lifecycleCase('B',this.lifecycleHorizon);
    const netUpside=b.contribution-a.contribution-this.redesignCost;
    if(this.revision==='A' && netUpside>0) {
      items.push({tone:'good',icon:'layers',title:'Rev B looks favorable at planned volume',desc:`Modeled upside: $${Math.round(netUpside).toLocaleString()} over ${this.lifecycleHorizon.toLocaleString()} good units, after assumed redesign cost.`,action:'Release Rev B',key:'revision',value:'B'});
    } else if(this.revision==='A' && netUpside<=0) {
      items.push({tone:'warning',icon:'layers',title:'Defer Rev B for current demand scenario',desc:`Modeled redesign payback is short by $${Math.round(-netUpside).toLocaleString()}. Test a longer product horizon or lower cost.`,action:'View lifecycle lab',key:'focus',value:'lifecycle'});
    }
    if(!items.length){items.push({tone:'good',icon:'check',title:'Production line nominal',desc:'No urgent thresholds breached. Continue monitoring equipment wear and first-pass yield.',action:'View forecast',key:'focus',value:'forecast'});}
    return items.slice(0,3);
  }

  record() {
    const row={
      t:this.elapsed, recipe:this.revision, target:this.target, pace:r1(this.pace*100),
      good:this.good, scrap:this.scrap, goodA:this.goodRev.A, goodB:this.goodRev.B,
      scrapA:this.scrapRev.A, scrapB:this.scrapRev.B, wip:this.wip,
      material:this.material, rate:r1(this.rollingRate), oee:r1(this.oee*100),
      availability:r1(this.availability*100), quality:r1(this.yieldRate*100),
      energy:r1(this.energyKwh),
      ...Object.fromEntries(this.machines.map(m=>[`${m.key}Wear`,r1(m.wear)])),
    };
    this.history.push(row);
    if(this.history.length>300) this.history.shift();
    return row;
  }

  snapshot(){
    const f=this.forecast();
    return {
      elapsed:this.elapsed, running:this.running, speed:this.speed,
      revision:this.revision, pace:this.pace, target:this.target,
      lifecycleHorizon:this.lifecycleHorizon, redesignCost:this.redesignCost,
      material:this.material, unitsStarted:this.unitsStarted, good:this.good, scrap:this.scrap,
      wip:this.wip, buffers:this.buffers.map(b=>b.length),
      energyKwh:this.energyKwh,
      rate:this.rollingRate, theoreticalRate:this.theoreticalRate,
      oee:this.oee, performance:this.performance,availability:this.availability, quality:this.yieldRate,
      forecast:f,
      machines:this.machines.map(m=>({key:m.key,code:m.code,name:m.name,type:m.type,stage:m.stage,
        wear:m.wear,health:clamp(100-m.wear,0,100),temperature:m.temp,vibration:m.vibration,
        state:m.locked?'TRIPPED':m.down>0?(m.maintenance?'MAINTENANCE':'DOWN'):m.active?(m.active.remaining<=0?'BLOCKED':'RUNNING'):'IDLE',
        progress:m.active?clamp(100*(1-m.active.remaining/this.stationCycle(m,m.active.revision)),0,100):0,
        completed:m.completed,runSeconds:m.runSeconds,downSeconds:m.downSeconds,
        nominalCycle:m.cycle,eta:this.machineForecast(m).hours,
        fault:m.fault,maintenance:m.maintenance,active:m.active?.id??null
      })),
    };
  }
}
