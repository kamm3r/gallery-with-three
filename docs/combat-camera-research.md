# Combat responsiveness and camera design

Researched 2026-10-06. These sources support techniques, not a claim that our
implementation reproduces FromSoftware's proprietary timings.

## Primary research and developer writing

- Normoyle, Guerrero and Jörg, [Player Perception of Delays and Jitter in Character Responsiveness](https://repository.upenn.edu/bitstreams/a439e51b-65d2-4c7f-a7c4-cd752502f092/download), ACM Symposium on Applied Perception, 2014, DOI 10.1145/2628257.2628263. [SIGGRAPH's proceedings abstract](https://www.siggraph.org/wp-content/uploads/2021/11/SAP-14-Proceedings-of-the-ACM-Symposium-on-Applied-Perception-1.html) is also available. This platform-game study found that varying delays affected timing performance and perceived motion quality. Its casual-player experiment does not establish acceptable Souls combat latency. Our inference: consistent input handling matters alongside minimizing delay.
- Norman Nazaroff, [Dealing With Designer Input Latency](https://www.beyondthenorm.org/dealing-with-designer-input-latency/), 2011. Expiring input buffers preserve intent during finite actions; defined interruption windows can complement buffers. Shared tap/hold controls defer their decision until release and introduce deliberate latency.
- Mark Haigh-Hutchinson, Retro Studios, [Fundamentals of Real-Time Camera Design](https://media.gdcvault.com/gdc05/slides/GD_Haigh-Hutchinson_FundamentalsReal-TimeCameraDesign.pdf), GDC 2005. Slides 22–23 emphasize visibility, smooth motion, manipulation and preserving player intent; slides 34–39 connect camera design to each environment and sufficient framing space.
- Unity, [Cinemachine Deoccluder](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDeoccluder.html). Documents obstacle filtering, sphere clearance, holding the closest position to reduce pumping, and distinct occlusion/return damping. We apply these principles to our existing Rapier camera; we do not depend on Cinemachine.

## Changes and project-specific tuning

Existing combat input now retains one request per action for 180 ms and permits
dodge during sword recovery after 65% of the swing, beyond its damage window.
These are our tunable values, not sourced Elden Ring numbers. Shared Space
continues to dodge on release; choosing a separate sprint key enables press-time
dodge. No source warrants changing the player's chosen default silently.

The parish now uses spherical mouse orbit: pitch −0.65 to 1.05 radians, initially
0.24, a 7.5 m arm and 60° vertical FOV. Mouse-wheel zoom spans 4–10 m and respects
inverted look/sensitivity. These framing choices need playtesting; published
camera guidance does not prescribe them. Other worlds retain their own rig.

Enemies and disabled corpses no longer shorten the camera arm. Stonework still
uses a 0.35 m sphere sweep. Occlusion pulls inward immediately, holds the closest
distance for 120 ms, then recovers with frame-independent exponential damping.
Mouse yaw/pitch take effect directly rather than inheriting positional lag.
All persistent orbit, zoom and occlusion-recovery state lives in Koota records.
The combat rig casts along the direction it actually renders, avoiding the old
mismatch between the desired orbit and an interpolated position near corners.

Seven additional 8×8 m floor tiles add 448 m²: court/refuge widths increase from
24 to 32 m; the garden extends from 24 to 32 m deep. Tile-based collision, walls,
navigation and floor queries share the expansion. Barred shortcuts and ramp
heights remain intact, and existing instancing handles the added stonework.

## Verification

The native preview reproduced an NPC pushing the old camera inward by 3.17 m.
Replaying the same scenario with the new rig measured 0 m NPC-induced movement.
Real Rapier tests cover actor filtering, stale corpse entries and wall collision;
recovery tests cover the close-distance hold and immediate clearance correction.
Existing traversal tests cover connected regions, barred shortcuts, matching ramp
heights and reachability around physical props. This is not an end-to-end hardware
latency or frame-rate measurement, nor a substitute for player camera feedback.
