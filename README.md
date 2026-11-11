# FORGE — Manufacturing Digital Twin

**Project 2: Software-based digital twin of a manufacturing system**

An interactive, static-hostable production simulator with live virtual telemetry, bottleneck and quality analysis, preventive-maintenance prediction, operational stress tests, and product lifecycle decision support.

> **Important technical distinction:** This is an **educational, simulated digital-twin prototype**. The plant and sensor data are generated inside the software; it is not connected to physical machinery. Predictions are transparent engineering heuristics and assumed economics, not trained machine-learning models or validated reliability estimates.

## Launch

- **Live web application:** After enabling GitHub Pages, open https://oia7.github.io/Manufacturing-Digital-Twin/.
- **Offline single-file application:** Open `Industrial_Manufacturing_Digital_Twin.html` in Chrome, Edge, or Firefox. No installation required.
- **Modular development version:** In the project directory, run `python -m http.server 8000`, then open `http://localhost:8000/`. `index.html` uses JavaScript modules, which should be served over HTTP; directly double-click the standalone file for `file://` use.
- **Unit tests:** Requires Node.js 20 or later. Run `npm test`. No package installation needed.

## What the dashboard actually does

| Requirement | Implemented capability |
| --- | --- |
| Virtual manufacturing process | Discrete-time, four-station valve assembly line with job-by-job flow and bounded buffers |
| Operating-condition monitoring | Machine temperatures, vibration, cumulative wear, good units, scrap, raw material, WIP, utilization and energy |
| Performance analysis | Rolling units/hour, capacity, simulated OEE proxy, yield, bottleneck station, utilization and CSV export |
| Problem prediction | Rule-based time-to-service, next-shift good-unit estimate, and prioritized corrective actions |
| Lifecycle decisions | Rev A vs Rev B design comparison: quality, price, materials, conversion, warranty cases, modeled contribution, redesign investment and break-even volume |
| Experimentation | Speed and output goals, cooling failure, bearing fault, inspection drift, conveyor jam and supplier disruption |
| Action support | One-click new product release, preventive maintenance scheduling, replenishment, pause/reset and time acceleration |

## How to demonstrate the project

1. Load the dashboard. Default 60× accelerated simulation runs immediately.
2. Observe all four stations process jobs and the good-unit/quality counters rise.
3. Inspect KPI cards and watch the rolling-output and wear charts update.
4. Select **Bearing vibration**. Observe increasing vibration, rising wear, and a shortening service ETA.
5. Select **M-02 · Assembly** in the service dropdown, then **Schedule service**. After 180 simulated seconds it returns to production.
6. Select **Vision drift**. Watch the expected scrap risk rise, and clear it by servicing **M-03**.
7. Under **Revision decision lab**, compare A and B. Change **Planned good units** and **Rev B redesign investment** to compare break-even decisions. Choose **Release Rev B** and observe the new recipe adopted by subsequently started jobs.
8. Experiment with **Production pace** and **Shift target**, then export the CSV telemetry and activity log.

## Factory model

```
Raw valve kits → CNC machining → Buffer 1 → Robotic assembly → Buffer 2
                                   ↓
Packaged good units ← Packaging ← Buffer 3 ← Vision inspection
                                               ↳ Rejected / scrap
```

- Four stations have nominal cycle times **32, 43, 36 and 25 simulated seconds**.
- Downstream buffers hold **up to eight** workpieces each.
- CNC and robotic assembly include temperature/vibration safety trips. Wear grows with use; high line pace accelerates wear and defects.
- Jobs preserve their **revision identity** across the process, including when the production recipe changes mid-run.
- A failed visual inspection removes the workpiece and increments scrap; otherwise the part flows to packaging.
- Each simulated second moves time forward, updates sensor state, carries workpieces and records faults. One history sample is recorded every simulated minute (latest 300 samples retained).
- The model is deterministic for a fixed random seed and fixed sequence of operator actions.

### Simplifying assumptions

No setup times, mixed-batch scheduling, material lead-time distributions, shift breaks, rework routing, transport failures, labor constraints, real PLC integration, calibration data or external persistence. WIP is bounded by station workpieces plus the three intermediate buffers. Raw kits begin at 1,200. A material shortage scenario brings 500 kits after 420 simulated seconds. Sensor values are derived from a simplified dynamic model, not physical measurements.

## Engineering calculations

**Theoretical bottleneck throughput (units/hour):** `3600 / max(effective_station_cycle_seconds)`.

**Rolling throughput:** `good units shipped in recent 600 simulated seconds × 3600 / seconds observed`; during warm-up, the observed interval is shorter than 600 seconds.

**Modeled availability:** `1 − (sum of machine downtime seconds) / (number of machines × elapsed scheduled seconds)`.

**Modeled performance:** `min(1, (good units + inspection scrap) / (elapsed × theoretical_rate / 3600 × availability))`.

**Modeled first-pass quality:** `good units / (good units + inspection scrap)`; during warm-up it defaults to 100%.

**Line OEE proxy:** `availability × performance × quality`. This is an educational line-level approximation, not a validated plant OEE report. It uses a simplification for cross-station downtime and inspection scrap. Do not treat results as independent accounting/quality records.

**Time to service threshold:** `max(0, (85 − wear_index) / predicted_wear_per_simulated_second) ÷ 3600`. Wear rate is increased by overspeed and bearing faults and scaled by observed loading. At a hard machine trip, service ETA becomes zero. This is a rule-based estimate, not a statistically calibrated remaining-useful-life (RUL) predictor.

**Next-shift good-unit forecast:** `min(bottleneck_theoretical_output × modeled_availability × projected_yield × 0.98, available_raw_and_WIP_kit_count × projected_yield)` for an eight-hour shift, rounded to the nearest unit. Baseline availability is assumed to be 96.5% until sufficient downtime is observed. The projection assumes **no operator intervention**; an uncleared safety trip results in zero projected output. It does not include future spontaneous faults or unmodeled deliveries.

## Lifecycle business case

Assumptions are illustrative USD amounts:

| Parameter | Rev A | Rev B |
| --- | ---: | ---: |
| Selling price per shipped good unit | $89 | $95 |
| Material cost per started unit | $37.80 | $42.40 |
| Processing cost per started unit | $10.20 | $9.60 |
| Inspection defect probability | 3.6% | 1.5% |
| Expected warranty claim probability | 2.8% | 1.2% |
| Expected cost per warranty claim | $42 | $42 |
| Assembly cycle multiplier | 1.00 | 0.94 |

At a selectable demand horizon (default **25,000 shipped good units**) with selectable redesign investment (default **$50,000**):

- `units_started = good_demand / (1 − defect_probability)`
- `expected_scrap = units_started − good_demand`
- `gross_revenue = good_demand × selling_price`
- `material_and_conversion = units_started × (materials + processing)`
- `warranty_reserve = good_demand × warranty_probability × claim_cost`
- `operating_contribution = gross_revenue − material_and_conversion − warranty_reserve`
- `Rev_B_scenario_net = Rev_B_operating_contribution − chosen_one_time_redesign_cost`
- `break_even_good_units = redesign_cost / (Rev_B_contribution_per_good − Rev_A_contribution_per_good)`

**Not included:** Further development and validation costs beyond the user-selected assumed redesign amount, tooling, capex, warranty tail risks, overhead, taxes, carrying costs, regulatory approvals, price elasticity and change-management costs. A higher modeled contribution is not proof that the redesign should be commercialized without these costs.

## Repository contents

```text
.
├── index.html                                # GitHub Pages entry point
├── Industrial_Manufacturing_Digital_Twin.html # Standalone offline build
├── src/
│   ├── model.js                              # Deterministic manufacturing model
│   ├── app.js                                # UI, charts, controls and CSV exports
│   └── styles.css                            # Responsive dashboard style
├── tests/
│   └── model.test.js                         # Automated simulation checks
├── assets/
│   ├── dashboard-desktop.png                 # Desktop preview
│   └── dashboard-mobile.png                  # Mobile preview
├── .github/workflows/test.yml                # Node CI tests
├── PROJECT_REPORT.md                         # Technical report and limitations
├── LICENSE
├── package.json
└── README.md
```

## Publish on GitHub Pages

1. Create a **separate public repository** for this project, for example `Manufacturing-Digital-Twin`.
2. Upload/extract these files **at the repository root**. Do not upload only the ZIP.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, branch **main**, folder **/(root)**, and click **Save**.
5. Once deployment reports success, test the rendered UI at https://oia7.github.io/Manufacturing-Digital-Twin/.
6. Submit that website URL to Blackboard. The repository remains public and students/teachers can also inspect the source code.

No backend, secret keys, cloud accounts, user tracking, database or commercial libraries are used by the application.

## Validation

Run `npm test` to check mass balance, buffer bounds, startup, fault trips, maintenance and recovery, deterministic seeds, product revision preservation, OEE bounds, economic comparisons and forecasts. Browser UI controls can be validated manually using the demo procedure above. Tests are demonstrations of model consistency, **not validation against real manufacturing measurements**.

## License

MIT. Educational demonstration only.