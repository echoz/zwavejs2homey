# HA-Derived Rules

Generated from the Home Assistant `zwave_js` discovery extraction/translation pipeline.

Current canonical file:

- `home-assistant.zwave_js.generated.json`

Regenerate with:

```bash
npm run ha-import:extract -- --source-home-assistant docs/external/home-assistant --output-extracted /tmp/ha-extracted.json --format summary
npm run ha-import:report -- --input-file /tmp/ha-extracted.json --output-generated rules/ha-derived/home-assistant.zwave_js.generated.json --format summary
```
