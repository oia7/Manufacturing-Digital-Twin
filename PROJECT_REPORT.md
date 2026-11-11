# Project 2 — Manufacturing System Digital Twin

## 1. Objective
Develop a software-based digital twin demonstrating the operating state and production behavior of a valve manufacturing line, tracking virtual sensor data, analyzing operational efficiency, highlighting imminent maintenance risks, and supporting revisions across a product's production and after-sales lifecycle.

## 2. Scope
- Virtual line: CNC machining → robotic assembly → vision inspection → packaging.
- Simulation: one-second discrete-time workpiece movement, buffer occupancy, random inspection failures, thermal and vibration dynamics, process wear and downtime.
- Monitoring: throughput, quality, machine condition, material inventory and work in progress.
- Predictions: line-rate and next-shift production forecast, threshold-based preventive maintenance ETA and priority action list.
- Lifecycle: manufacturing recipe A/B, modeled manufacturing economics, yield and expected warranty exposure.
- Control: pause/resume, speedup, change production rate/target, trigger five fault types, schedule machine service and replenish material.

## 3. Architecture

```text
                           +---------------------+
 Operator actions --------->| Browser dashboard   |
                           | src/app.js          |
                           +----------+----------+
                                      |
                                      v
                           +---------------------+
                           | FactoryTwin model   |
                           | src/model.js        |
                           +----------+----------+
                                      |
                   +------------------+--------------------+
                   |                  |                    |
                   v                  v                    v
          4-station plant      Prediction rules     Revision A/B cost
          emulator + jobs     + insight generator     scenario calculator
                   |                  |                    |
                   +------------------+--------------------+
                                      |
                              Virtual telemetry
                                      |
                            KPI, charts, CSV export
```

This prototype synthesizes plant telemetry instead of ingesting real IoT/PLC observations. Therefore its predictive capability is a demonstration of a digital-twin analytics workflow rather than an externally calibrated production prediction system.

## 4. Model design
Each active machine holds zero or one job; three first-in-first-out buffers hold up to eight jobs each. Job properties include unique ID, revision, and remaining stage time. A downstream-first completion and start order avoids buffer overflow. Inspection defects become scrap; only packaged accepted units count as good shipped units. The model includes five fault injections and preventive maintenance with a simulated 180-second repair interval.

The key correctness invariant is:

`units started = good shipped units + inspection scrap units + current work-in-progress`.

## 5. Monitoring and analysis
Visible metrics include overall equipment effectiveness (OEE proxy), finished good units, first-pass quality, next-shift estimated output, rolling good-units/hour, four machines' health indices, temperature, vibration and repair ETA, raw input stock, work-in-progress buffers, logged operations and time-series charts.

The OEE, forecast, product cost, wear limits and fault response are simplified examples. They should not be interpreted as actual plant baseline statistics.

## 6. Predictive and decision-support workflow
1. The simulator calculates wear and sensor metrics after each time step.
2. If wear hits 85, the service model returns a zero time-to-maintenance threshold; if a hard safety trip occurs, forecasted throughput is set to zero until intervention.
3. The forecast estimates eight-hour good unit production using bottleneck rate, availability, defect fraction and available materials.
4. Decision support prioritizes maintenance, stock replenishment, inspection calibration, meeting output goals or switching product revision where modeled economics are advantageous.
5. The operator can select the corresponding corrective action directly from the dashboard.

This approach is **rule-based predictive maintenance**, not a deep-learning system, and it has no measured field failure history. Actual industrial use would require sensor integration, alarm tuning, fault classification validation and RUL calibration against maintenance records.

## 7. Lifecycle support
Rev A is the baseline design, while Rev B is an assumed redesigned seal configuration offering less expected scrap and warranty expense, at a higher unit material cost and selling price. The comparison is configurable from **5,000 to 100,000 successfully shipped good units**, with an assumed one-time redesign investment from **$0 to $250,000**. Defaults are 25,000 units and $50,000. The model estimates production quantity, scrap, gross revenue, direct material and conversion costs, expected claim cost, contribution net of selected redesign investment, and break-even volume. The dashboard can release the selected recipe to newly started jobs.

The decision model excludes further development expenditure outside the chosen redesign investment, capital, regulatory, and opportunity costs; positive operating contribution is not a full investment recommendation.

## 8. Test and evaluation plan
Run `npm test`. Then verify the following user journeys using the browser:

| Test scenario | Expected result |
| --- | --- |
| Normal operation | Four stations process jobs; output increases; no buffer exceeds eight |
| Cooling loss | CNC temperature rises; overtemperature interlock trips the machine |
| Bearing fault | Assembly vibration rises; projected service ETA falls |
| Inspection drift | Expected defect probability rises; visual defect count increases over time |
| Packaging jam | Packaging temporarily stops and clears after 240 simulated seconds |
| Supplier delay | Raw stock removed; supplier delivers 500 kits after 420 simulated seconds |
| Preventive service | Selected machine down for 180 simulated seconds, wear/fault reset |
| Rev B release | Only newly started jobs use Rev B; lifecycle economics update |
| Pause / resume | Clock and production freeze when paused and resume normally |
| CSV export | CSV includes time-stamped virtual telemetry and event log |
| Mobile layout | Content stays within device width, with touch-operable controls |

## 9. Deployment
All files can be hosted publicly with GitHub Pages. `index.html` loads relative modules from `src/` so it works under a repository subdirectory. Alternatively, the independently bundled HTML can be double-clicked on Windows without hosting.

## 10. Limitations and future development
- No real PLC, MQTT, OPC UA, sensor streams or digital-thread connection. Suitable only as a prototype.
- Calibration parameters are not sourced from any specific manufacturer.
- Simplified stochastic defects and wear trend, no physics solver or statistically valid reliability model.
- No batch scheduling, lot traceability, repair yield, supply-chain uncertainty or operators.
- Data remains in browser memory until manually exported; no persistence across reloads.
- For a real factory twin, add authenticated real-time telemetry, calibration against actual cycle times, historical production/maintenance database, residual comparison of observed vs modeled equipment, model versioning, production validation and security controls.

## Conclusion
The application demonstrates the integrated digital-twin workflow: virtual production representation, measurement, analytics, fault prediction and product lifecycle decision support. It does not claim industrial certification or physical process synchronization.