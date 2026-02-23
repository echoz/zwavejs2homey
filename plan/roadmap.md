# Roadmap

## Phase 1: Foundation

- [x] Bootstrap Homey app project
- [x] Create shared core package
- [x] Wire Homey app to core placeholder service
- [ ] Establish workspace install/build workflow from repo root
- [ ] Add baseline lint/build scripts and CI approach

## Phase 2: Core Bridge MVP

- [ ] Define bridge service interface/events
- [ ] Connect to Z-Wave JS endpoint (configurable)
- [ ] Expose network health/status
- [ ] Basic device inventory snapshot API

## Phase 3: Homey Integration MVP

- [ ] Define first supported device class/capability mapping
- [ ] Implement driver + pairing flow
- [ ] Sync capability updates from core events
- [ ] Send Homey commands back to core

## Phase 4: Reliability + UX

- [ ] Reconnect and error handling strategy
- [ ] Settings/diagnostics UI
- [ ] Logging strategy and support bundle notes
- [ ] Test coverage expansion
