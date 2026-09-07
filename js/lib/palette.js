/* The manuscript's figure palette, so the site and the paper read as
   one system (02_analysis/_shared/constants.py): navy, deep pink,
   deep green and grays; never light blue or orange. Storm colors are
   read from meta.json, so a storm added to the analysis gets its
   color from the data layer, not from here. */

export const INK = "#14181d";
export const NAVY = "#16385c";
export const PINK = "#a8325e";
export const GREEN = "#2f6b4f";
export const WINE = "#7b1e3b";
export const GRAY = "#8c8c8c";
export const GRID = "#e4e7ea";
export const RULE = "#c9ced4";
export const MUTED = "#6a7280";
export const NODATA = "#e3e3e0";
export const LAND = "#eceae6";
export const LIGHT = "#dcdcdc";

export const CATEGORICAL = [
  NAVY, PINK, GREEN, GRAY, "#5c7d8a", "#8a6c8f", "#5ca6a0", "#8a7d5c",
  "#9a5a6a", "#3f6f8f",
];

/* stated cause classes of a notice (a05) */
export const CAUSE = {
  power: { label: "Lost power or failed generator", color: NAVY },
  wet_weather: { label: "Wet weather, inflow and infiltration", color: GREEN },
  break: { label: "Main or pipe break", color: PINK },
  blockage: { label: "Blockage", color: "#5c7d8a" },
  mechanical: { label: "Mechanical or electrical fault", color: "#8a7d5c" },
  third_party: { label: "Third party", color: "#8a6c8f" },
  storm_unspecified: { label: "Storm, mechanism not stated", color: GRAY },
  other: { label: "Other or not stated", color: LIGHT },
};
export const CAUSE_ORDER = ["power", "wet_weather", "break", "blockage",
  "mechanical", "third_party", "storm_unspecified", "other"];

/* how a power-caused release ended (a15) */
export const END = {
  operator: { label: "Operator action: generator, bypass, truck", color: NAVY },
  grid: { label: "Grid restored", color: PINK },
  repair: { label: "Repair", color: GREEN },
  unstated: { label: "Not stated", color: LIGHT },
};
export const END_ORDER = ["operator", "grid", "repair", "unstated"];

/* FCC cause of a cell site being out (a16) */
export const CELL_CAUSE = {
  power: { label: "Power", color: NAVY },
  transport: { label: "Transport (backhaul)", color: PINK },
  damage: { label: "Damage", color: GREEN },
};

const hex = (c) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
const mix = (a, b, t) => "#" + a.map((v, i) =>
  Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");

const NAVY_RGB = hex(NAVY);
const GREEN_RGB = hex(GREEN);
const WINE_RGB = hex(WINE);
const MID_RGB = hex("#f2f0ec");

/** Sequential blue ramp for magnitude-only quantities, t in [0, 1]. */
export function sequential(t) {
  return mix(hex("#dce6f0"), NAVY_RGB, Math.max(0, Math.min(1, t)));
}

/** Sequential green ramp (rain). */
export function sequentialGreen(t) {
  return mix(hex("#dfe9e3"), GREEN_RGB, Math.max(0, Math.min(1, t)));
}

/** Diverging navy-to-wine ramp, t in [0, 1] with .5 at the center. */
export function diverging(t) {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? mix(NAVY_RGB, MID_RGB, u * 2)
    : mix(MID_RGB, WINE_RGB, (u - 0.5) * 2);
}

/** Lighten a hex color toward white by fraction t. */
export function lighten(c, t = 0.5) {
  return mix(hex(c), [255, 255, 255], t);
}
