import test from 'node:test';
import assert from 'node:assert/strict';
import {FactoryTwin, RECIPES, MACHINES, lifecycleCase, SHIFT_SECONDS} from '../src/model.js';

const factory = seed => new FactoryTwin(seed);
const exhaust = (f,n) => {for(let left=n;left>0;){const step=Math.min(10000,left);f.step(step);left-=step;}};

test('initial conditions are valid',()=>{
  const f=factory(1);
  assert.equal(f.good,0);assert.equal(f.scrap,0);assert.equal(f.wip,0);
  assert.equal(f.material,1200);assert.equal(f.machines.length,4);assert.equal(f.availability,1);
  assert.equal(f.theoreticalRate,3600/43);
});

test('the process produces complete good units in the right sequence',()=>{
  const f=factory(10);f.step(1000);
  assert.ok(f.good>0,'Good units should reach packaging');
  assert.ok(f.machines.every(m=>m.completed>0));
});

test('strict material balance: input = good + scrap + in-flight WIP',()=>{
  const f=factory(22);
  for(let i=0;i<100;i++){f.step(50);assert.equal(f.unitsStarted,f.good+f.scrap+f.wip);}
});

test('interstation buffers never exceed eight jobs',()=>{
  const f=factory(44);f.inject('packaging');exhaust(f,6200);
  assert.ok(f.buffers.every(b=>b.length<=8));
  assert.equal(f.unitsStarted,f.good+f.scrap+f.wip);
});

test('pausing freezes simulated time and production',()=>{
  const f=factory(4);f.step(400);const prior=f.snapshot();
  f.running=false;f.step(800);
  assert.equal(f.elapsed,prior.elapsed);assert.equal(f.good,prior.good);
  f.running=true;f.step(200);assert.equal(f.elapsed,prior.elapsed+200);
});

test('invalid commands are rejected',()=>{
  const f=factory(1);
  assert.throws(()=>f.inject('unknown'),RangeError);
  assert.throws(()=>f.maintain('missing'),RangeError);
  assert.throws(()=>f.setRevision('C'),RangeError);
  assert.throws(()=>f.setPace(NaN),TypeError);
  assert.throws(()=>f.setTarget(Infinity),TypeError);
  assert.throws(()=>f.step(10001),RangeError);
  assert.throws(()=>f.replenish(-1),RangeError);
});

test('supply disruption removes input and triggers a bounded resupply',()=>{
  const f=factory(3);f.inject('supply');
  assert.equal(f.material,0);
  f.step(419);assert.equal(f.material,0);
  f.step(1);assert.ok(f.material>=499);
  assert.equal(f.faults.supply,0);
});

test('packaging jam stops the station and automatically clears',()=>{
  const f=factory(5);f.inject('packaging');assert.equal(f.machines[3].down,240);
  f.step(200);assert.equal(f.machines[3].down,40);
  f.step(40);assert.equal(f.machines[3].down,0);
  assert.equal(f.machines[3].fault,null);
});

test('cooling fault ultimately trips CNC machine',()=>{
  const f=factory(5);f.inject('cooling');f.step(200);
  assert.equal(f.machines[0].locked,true);
  assert.equal(f.machines[0].fault,'Overtemperature trip');
});

test('maintenance clears a trip, takes time, then resumes production',()=>{
  const f=factory(7);f.inject('cooling');f.step(100);
  assert.equal(f.machines[0].locked,true);
  assert.equal(f.maintain('cnc'),true);
  assert.equal(f.machines[0].locked,false);
  assert.equal(f.faults.cooling,false);
  assert.equal(f.machines[0].down,180);
  assert.equal(f.maintain('cnc'),false);
  f.step(180);assert.equal(f.machines[0].maintenance,false);
});

test('bearing fault raises vibration / maintenance estimate worsens',()=>{
  const f=factory(8);const baseline=f.machineForecast(f.machines[1]).hours;
  f.inject('bearing');f.step(45);
  assert.ok(f.machines[1].vibration>5);
  assert.ok(f.machineForecast(f.machines[1]).hours<baseline);
});

test('vision fault increases modeled defect probability',()=>{
  const f=factory(9);const before=f.defectProbability('A');
  f.inject('vision');assert.ok(f.defectProbability('A')>=before+.09);
  f.maintain('inspection');assert.equal(f.faults.vision,false);
});

test('revision change applies to new jobs, not already-running jobs',()=>{
  const f=factory(11);f.step(1);
  const original=f.machines[0].active;
  assert.equal(original.revision,'A');
  f.setRevision('B');
  assert.equal(f.machines[0].active.revision,'A');
  f.step(34);assert.equal(f.machines[0].active.revision,'B');
});

test('rev B changes economics and estimates lower scrap/claims',()=>{
  const a=lifecycleCase('A'),b=lifecycleCase('B');
  assert.ok(b.scrap<a.scrap);assert.ok(b.expectedClaims<a.expectedClaims);
  assert.ok(b.contribution>a.contribution);
  assert.equal(a.demand,b.demand);
});

test('wear increases under load and ETA declines',()=>{
  const f=factory(2);
  const before=f.machineForecast(f.machines[0]).hours;
  const wear=f.machines[0].wear;
  f.step(700);
  assert.ok(f.machines[0].wear>wear);
  assert.ok(f.machineForecast(f.machines[0]).hours<before);
});

test('OEE component values remain within 0-100%',()=>{
  const f=factory(19);exhaust(f,3800);
  for(const n of [f.availability,f.performance,f.yieldRate,f.oee]) assert.ok(n>=0 && n<=1);
  assert.ok(Math.abs(f.oee-f.availability*f.performance*f.yieldRate)<1e-12);
});

test('history bounded, event log bounded and exported fields are numbers',()=>{
  const f=factory(12);exhaust(f,SHIFT_SECONDS);
  assert.ok(f.history.length<=300);assert.ok(f.events.length<=180);
  for(const r of f.history)assert.ok(Number.isFinite(r.good)&&Number.isFinite(r.rate));
});

test('deterministic replay with fixed seed and actions',()=>{
  const a=factory(77),b=factory(77);
  for(const f of [a,b]){f.step(300);f.setRevision('B');f.inject('vision');f.step(1200);f.maintain('inspection');f.step(1200);}
  assert.deepEqual([a.good,a.scrap,a.wip],[b.good,b.scrap,b.wip]);
});

test('redesign investment changes lifecycle decision and respects demand horizon',()=>{
  const f=factory(50);
  f.setLifecycleScenario(5000,100000);
  const insight=f.insights().find(x=>x.title.includes('Rev B'));
  assert.match(insight.title,/Defer/);
  f.setLifecycleScenario(100000,100000);
  assert.ok(f.insights().some(x=>x.title.includes('Rev B looks favorable')));
});

test('future-shift forecast drops to zero if any station has unserved safety trip',()=>{
  const f=factory(51);assert.ok(f.forecast().nextShiftGood>0);
  f.inject('cooling');f.step(120);
  assert.ok(f.machines[0].locked);
  assert.equal(f.forecast().nextShiftGood,0);
});

test('forecast is bounded by available production material',()=>{
  const f=factory(52);
  f.material=1;
  assert.ok(f.forecast().nextShiftGood<=1);
});
