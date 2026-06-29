/**
 * Asset Manager — shared constants.
 *
 * Centralised domain string, entity-kind catalogue, and the kind→capability
 * sets used by both the entity editor and the inline value editor. Kept in
 * its own module so every other module imports a single source of truth
 * instead of re-declaring literals.
 */

export const DOMAIN = "asset_manager";

export const ENTITY_KINDS = [
  "number",
  "sensor",
  "date",
  "text",
  "select",
  "button",
  "switch",
  "derived",
];

export const wsPrefix = (coll) => `${DOMAIN}/${coll}`;

// HA's 27 named label colors. The label registry accepts either a hex
// string or one of these names. We map each name to its HA theme CSS
// variable so chips can render in-label colors without hardcoding hex.
export const LABEL_COLOR_NAMES = [
  "primary", "accent", "disabled",
  "red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue",
  "cyan", "teal", "green", "light-green", "lime", "yellow", "amber",
  "orange", "deep-orange", "brown", "light-grey", "grey", "dark-grey",
  "blue-grey", "black", "white",
];

// Map a label color value (named or hex) to a CSS color string usable
// inline. Named colors resolve to HA's --<name>-color theme variable
// (the same mapping HA's own computeCssColor uses in
// src/common/color/compute-color.ts); hex passes through. Unknown
// strings fall back to HA's primary-text color so chips stay legible
// rather than silently becoming transparent invalid CSS.
export const labelColorToCss = (color) => {
  if (!color) return null;
  if (color.startsWith("#")) return color;
  if (LABEL_COLOR_NAMES.includes(color)) {
    return `var(--${color}-color)`;
  }
  return `var(--primary-text-color)`;
};

// Sensor device classes offered in the entity editor dropdown. Mirrors
// homeassistant.components.sensor.SensorDeviceClass. The leading empty
// entry renders as the "none" / unset option so users can leave
// device_class unspecified.
export const SENSOR_DEVICE_CLASSES = [
  "",
  "date",
  "enum",
  "timestamp",
  "aesthetic",
  "apparent_power",
  "area",
  "battery",
  "blood_glucose_concentration",
  "carbon_monoxide",
  "carbon_dioxide",
  "conductivity",
  "current",
  "data_rate",
  "data_size",
  "distance",
  "duration",
  "energy",
  "energy_distance",
  "energy_storage",
  "frequency",
  "gas",
  "humidity",
  "illuminance",
  "irradiance",
  "moisture",
  "monetary",
  "nitrogen_dioxide",
  "nitrogen_monoxide",
  "nitrous_oxide",
  "ozone",
  "ph",
  "pm1",
  "pm10",
  "pm25",
  "power_factor",
  "power",
  "precipitation",
  "precipitation_intensity",
  "pressure",
  "reactive_power",
  "signal_strength",
  "sound_pressure",
  "speed",
  "sulphur_dioxide",
  "temperature",
  "volatile_organic_compounds",
  "volatile_organic_compounds_parts",
  "voltage",
  "volume",
  "volume_storage",
  "volume_flow_rate",
  "water",
  "weight",
  "wind_direction",
  "wind_speed",
];

// State classes — homeassistant.components.sensor.SensorStateClass
// plus an empty "unset" option.
export const SENSOR_STATE_CLASSES = [
  "",
  "measurement",
  "total",
  "total_increasing",
];

// Kinds that accept a unit_of_measurement.
export const KIND_HAS_UNIT = new Set(["number", "sensor", "derived"]);
// Kinds that accept an initial value (writable / stateful).
export const KIND_HAS_VALUE = new Set(["number", "text", "select", "date", "switch"]);

// Placeholder colour token. Uses HA's own placeholder variable
// (`--ha-color-neutral-60`, the same one `ha-input` uses for ::placeholder)
// so dark themes stay legible. Falls back to `--secondary-text-color` for
// older HA builds that don't define the neutral scale, then to a hardcoded
// grey. No opacity multiplier: HA's neutral-60 is already tuned for contrast
// on both light and dark card backgrounds; dimming it collapses to ~#6e6e6e
// on dark themes which is unreadable.
export const PLACEHOLDER_COLOR =
  "var(--ha-color-neutral-60, var(--secondary-text-color, #989898))";