#!/usr/bin/env python3
r"""Build the Paper 5 companion site's data layer from the analysis
outputs. Every file the site loads is written here, so the app never
carries numbers of its own: edit an analysis, re-run this script, and
the site follows. Nothing is embedded in the HTML.

Reads   06_Paper5_Cascade\02_analysis\a*\results\*
        06_Paper5_Cascade\03_manuscripts\collect_figures.py (figure map)
        01_rawData\fcc_dirs\fcc_dirs_reports.csv (report links)
Writes  05_webapp\data\*.json  (plus data\days\ and data\geo\)

Usage:
    py -3 build_data.py
"""

import importlib.util
import json
import math
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

HERE = Path(__file__).resolve().parent
APP = HERE.parent
PAPER = APP.parent
ROOT = PAPER.parent
A = PAPER / "02_analysis"
RAW = ROOT / "01_rawData"
DATA = APP / "data"

ORDER = ["irma", "michael", "sally", "ian", "nicole", "idalia", "debby",
         "helene", "milton"]
LABEL = {"irma": "Irma", "michael": "Michael", "sally": "Sally", "ian": "Ian",
         "nicole": "Nicole", "idalia": "Idalia", "debby": "Debby",
         "helene": "Helene", "milton": "Milton"}
YEAR = {"irma": 2017, "michael": 2018, "sally": 2020, "ian": 2022,
        "nicole": 2022, "idalia": 2023, "debby": 2024, "helene": 2024,
        "milton": 2024}
DR = {"irma": 4337, "michael": 4399, "sally": 4564, "ian": 4673,
      "nicole": 4680, "idalia": 4734, "debby": 4806, "helene": 4828,
      "milton": 4834}
# storm colors: the paper's palette (navy, deep pink, deep green, grays)
# for the three anchor storms, muted tones for the rest
COLOR = {"irma": "#16385c", "michael": "#2f6b4f", "sally": "#8c8c8c",
         "ian": "#a8325e", "nicole": "#9a9a7a", "idalia": "#5c7d8a",
         "debby": "#8a6c8f", "helene": "#5ca6a0", "milton": "#7b1e3b"}
NAMES = {k: f"{LABEL[k]} {YEAR[k]}" for k in ORDER}
KEY_BY_NAME = {v: k for k, v in NAMES.items()}
ERA = {"irma": "2017-2018", "michael": "2017-2018", "sally": "2020-2023",
       "ian": "2020-2023", "nicole": "2020-2023", "idalia": "2020-2023",
       "debby": "2024", "helene": "2024", "milton": "2024"}

# variables offered in the county-window explorer
VARS = [
    ("cust_hours_per_cust", "Customer-hours without power per customer", "dose", True),
    ("peak_share", "Peak share of customers out", "dose", False),
    ("h_gt50", "Hours above half of customers out", "dose", False),
    ("prcp_mm", "Rain in the window (mm)", "dose", False),
    ("prcp_max_mm", "Wettest day (mm)", "dose", False),
    ("n_sewer", "Sewer releases in the window", "sewer", False),
    ("sewer_per100k", "Sewer releases per 100,000 customers", "sewer", False),
    ("excess_per100k", "Excess releases per 100,000 customers", "sewer", False),
    ("n_power", "Releases naming lost power", "sewer", False),
    ("release_hours", "Release-hours in the window", "sewer", True),
    ("rate_per_mch", "Releases per million customer-hours", "sewer", True),
    ("silence_index", "Silence index (log observed over fitted)", "sewer", False),
    ("sewer_per_year_all", "Sewer notices a year (county habit)", "sewer", True),
    ("cell_peak_share", "Peak share of cell sites out", "cell", False),
    ("cell_site_days_out_per_site", "Cell site-days out per site", "cell", False),
    ("cell_power_share", "Share of cell outages due to power", "cell", False),
    ("pa_fed_per_cust", "PA emergency work reimbursed per customer (USD)", "response", False),
    ("closed_before", "Mitigation projects closed before the storm", "response", False),
    ("propensity", "Cascade propensity (county effect vs median)", "response", True),
    ("autonomy", "Operator-ended share of power-caused releases", "response", False),
    ("mcc", "Electricity customers", "context", True),
]
GROUPS = {"dose": "Outage and rain dose", "sewer": "Sewer releases",
          "cell": "Cell network", "response": "Response and adaptation",
          "context": "Context"}


def r(x, n=4):
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return x
    return None if (math.isnan(v) or math.isinf(v)) else round(v, n)


def clean(obj):
    """JSON has no NaN: a missing statistic becomes null and numpy
    scalars become plain Python numbers."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if obj is None or isinstance(obj, (str, bool)):
        return obj
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, int):
        return int(obj)
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if hasattr(obj, "item"):
        try:
            return clean(obj.item())
        except (ValueError, AttributeError):
            return None
    if isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    try:
        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


def write(obj, *parts, compact=True):
    path = DATA.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(clean(obj), fh, separators=(",", ":") if compact else None,
                  ensure_ascii=False)
    print(f"  {path.relative_to(APP)}  {path.stat().st_size // 1024} KB")


def columnar(df, cols, nd=4):
    rows = []
    for _, row in df[cols].iterrows():
        out = []
        for c in cols:
            v = row[c]
            if isinstance(v, (bool,)) or str(type(v)).endswith("bool_'>"):
                out.append(bool(v))
            elif isinstance(v, str):
                out.append(v)
            elif v is None:
                out.append(None)
            else:
                out.append(r(v, nd))
        rows.append(out)
    return {"columns": cols, "rows": rows}


def res(stage, name, **kw):
    p = A / stage / "results" / name
    if p.suffix == ".parquet":
        return pd.read_parquet(p)
    return pd.read_csv(p, dtype={"county_fips": str}, **kw)


def geometry(geom, tol, nd=4):
    g = geom.simplify(tol, preserve_topology=True)
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    rings = []
    for poly in polys:
        ring = [[round(x, nd), round(y, nd)] for x, y in poly.exterior.coords]
        rings.append(ring)
    return rings


def build_geo():
    print("geo")
    fl = gpd.read_file(A / "a07_florida_map" / "results" / "fl_counties.geojson")
    counties = [{"fips": row["GEOID"], "name": row["NAME"],
                 "rings": geometry(row.geometry, 0.0012, nd=5)}
                for _, row in fl.iterrows()]
    write({"counties": counties}, "geo", "counties.json")
    ctx = gpd.read_file(A / "a07_florida_map" / "results" / "context.geojson")
    ctx = ctx[~ctx["GEOID"].astype(str).str.startswith("12")].dissolve()
    write({"rings": geometry(ctx.geometry.iloc[0], 0.01, nd=5)}, "geo", "context.json")
    trk = res("a07_florida_map", "tracks.csv", parse_dates=["time"])
    tracks = {}
    for ev, g in trk.groupby("storm"):
        g = g.sort_values("time")
        lf = g[g["is_landfall"]]
        tracks[ev] = {"lon": [r(v, 2) for v in g["lon"]], "lat": [r(v, 2) for v in g["lat"]],
                      "vmax": [r(v, 0) for v in g["vmax"]],
                      "landfall": [r(lf.iloc[0]["lon"], 2), r(lf.iloc[0]["lat"], 2)] if len(lf) else None}
    write(tracks, "geo", "tracks.json")
    return {row["GEOID"]: row["NAME"] for _, row in fl.iterrows()}


def build_windows(names):
    print("windows")
    ce = res("a03_cascade_panel", "county_event.csv")
    si = res("a10_silence_index", "silence_index.csv")[["storm", "county_fips", "fitted", "fitted_zero_dose", "silence_index"]]
    cs = res("a16_cellular_dependency", "county_storm_cell.csv")[
        ["storm", "county_fips", "sites_served", "cell_peak_share", "site_days_out_per_site", "out_power_days", "site_days_out"]]
    cs = cs.rename(columns={"sites_served": "cell_sites", "site_days_out_per_site": "cell_site_days_out_per_site"})
    cs["cell_power_share"] = cs["out_power_days"] / cs["site_days_out"].replace(0, float("nan"))
    st = res("a18_adaptation_lag", "county_stock.csv")[["storm", "county_fips", "closed_before", "closed_sewer_before", "closed_fed_musd"]]
    pa = res("a18_adaptation_lag", "pa_by_county_storm.csv")[["storm", "county_fips", "pa_projects", "pa_fed", "autonomy", "stated"]]
    pr = res("a11_wind_or_wire", "county_propensity.csv")[["county_fips", "propensity_vs_median"]].rename(columns={"propensity_vs_median": "propensity"})
    mp = res("a07_florida_map", "county_map_data.csv")[["storm", "county_fips", "predicted", "pred_lo", "pred_hi", "missing"]]
    w = ce.merge(si, on=["storm", "county_fips"], how="left").merge(cs, on=["storm", "county_fips"], how="left")
    w = w.merge(st, on=["storm", "county_fips"], how="left").merge(pa, on=["storm", "county_fips"], how="left")
    w = w.merge(pr, on="county_fips", how="left").merge(mp, on=["storm", "county_fips"], how="left")
    w["county"] = w["county_fips"].map(names)
    w["rate_per_mch"] = w["n_sewer"] / (w["cust_hours"] / 1e6).replace(0, float("nan"))
    w["pa_fed_per_cust"] = w["pa_fed"] / w["mcc"]
    w["era"] = w["storm"].map(ERA)
    cols = ["storm", "county_fips", "county", "ia", "mcc", "n_sewer", "excess_sewer", "n_power",
            "release_hours", "cust_hours", "cust_hours_per_cust", "peak_share", "h_gt50", "h_gt10",
            "prcp_mm", "prcp_max_mm", "sewer_per100k", "excess_per100k", "sewer_per_year_all",
            "silent", "fitted", "fitted_zero_dose", "silence_index", "predicted", "pred_lo", "pred_hi",
            "missing", "cell_sites", "cell_peak_share", "cell_site_days_out_per_site", "cell_power_share",
            "closed_before", "closed_sewer_before", "closed_fed_musd", "pa_projects", "pa_fed",
            "pa_fed_per_cust", "autonomy", "stated", "propensity", "rate_per_mch", "era"]
    w["silent"] = w["silent"].astype(bool)
    w["ia"] = w["ia"].astype(bool)
    write(columnar(w, cols), "windows.json")
    return w


def build_days(names):
    print("days")
    panel = res("a03_cascade_panel", "panel.parquet")
    curves = res("a03_cascade_panel", "event_curves.csv")
    cell = res("a16_cellular_dependency", "cell_panel.csv")
    reports = pd.read_csv(RAW / "fcc_dirs" / "fcc_dirs_reports.csv")
    for k in ORDER:
        p = panel[panel["storm"] == k].sort_values(["county_fips", "t"])
        ts = sorted(p["t"].unique().tolist())
        counties = {}
        for fips, g in p.groupby("county_fips"):
            g = g.set_index("t").reindex(ts)
            counties[fips] = {
                "sewer": [int(v) if pd.notna(v) else 0 for v in g["n_sewer"]],
                "power": [int(v) if pd.notna(v) else 0 for v in g["n_power"]],
                "share": [r(v, 3) for v in g["mean_share"]],
                "peak": [r(v, 3) for v in g["peak_share"]],
                "rain": [r(v, 1) for v in g["prcp_mm"]],
                "base": r(g["baseline_sewer"].iloc[0], 3),
                "days_out_by_peak": None,
            }
        c = curves[(curves["storm"] == k)]
        frames = {}
        for fr, g in c.groupby("frame"):
            g = g.set_index("t").reindex(ts)
            frames[fr] = {"sewer": [r(v, 1) for v in g["n_sewer"]], "excess": [r(v, 1) for v in g["excess_sewer"]],
                          "power": [r(v, 1) for v in g["n_power"]], "share": [r(v, 4) for v in g["share_out"]],
                          "reported": [r(v, 1) for v in g["n_reported"]],
                          "active": [r(v, 1) for v in g["n_active"]] if "n_active" in g else None}
        cp = cell[cell["storm"] == k].copy()
        cp["report_date"] = pd.to_datetime(cp["report_date"])
        cells = {}
        for fips, g in cp.groupby("county_fips"):
            g = g.sort_values("t")
            cells[str(fips)] = {"t": [int(v) for v in g["t"]], "out": [int(v) for v in g["sites_out"]],
                                "served": [int(v) for v in g["sites_served"]],
                                "power": [r(v, 0) for v in g["out_power"]],
                                "damage": [r(v, 0) for v in g["out_damage"]],
                                "transport": [r(v, 0) for v in g["out_transport"]],
                                "backup": [r(v, 0) for v in g["up_on_backup"]],
                                "doc": g["doc"].tolist(),
                                "date": [d.date().isoformat() for d in g["report_date"]]}
        # storm-level cell totals by report day
        tot = cp.groupby("t").agg(out=("sites_out", "sum"), served=("sites_served", "sum"),
                                  power=("out_power", "sum"), damage=("out_damage", "sum"),
                                  transport=("out_transport", "sum"), backup=("up_on_backup", "sum"),
                                  doc=("doc", "first"), date=("report_date", "first")).reset_index()
        cell_total = {"t": [int(v) for v in tot["t"]], "out": [int(v) for v in tot["out"]],
                      "served": [int(v) for v in tot["served"]], "power": [r(v, 0) for v in tot["power"]],
                      "damage": [r(v, 0) for v in tot["damage"]], "transport": [r(v, 0) for v in tot["transport"]],
                      "backup": [r(v, 0) for v in tot["backup"]], "doc": tot["doc"].tolist(),
                      "date": [d.date().isoformat() for d in tot["date"]],
                      "max_served": int(cp.groupby("t")["sites_served"].sum().max()) if len(cp) else 0}
        dates = {int(t): d.date().isoformat() for t, d in zip(p["t"], pd.to_datetime(p["day"]))}
        write({"storm": k, "t": ts, "dates": [dates.get(t) for t in ts], "counties": counties,
               "frames": frames, "cells": cells, "cell_total": cell_total}, "days", f"{k}.json")


def build_dose():
    print("dose")
    mc = res("a04_dose_response", "marginal_curve.csv")
    ma = res("a04_dose_response", "model_A_window.csv")
    two = res("a04_dose_response", "model_A_two_doses.csv")
    era = res("a04_dose_response", "model_B_era.csv")
    ss = res("a04_dose_response", "model_B_storm_slopes.csv")
    lag = res("a04_dose_response", "model_C_lag.csv")
    fe = res("a04_dose_response", "model_A_storm_fe.csv")
    summ = json.load(open(A / "a04_dose_response" / "results" / "model_summary.json"))
    mcell = res("a16_cellular_dependency", "models_cell.csv")
    s16 = json.load(open(A / "a16_cellular_dependency" / "results" / "summary.json"))
    med = res("a11_wind_or_wire", "mediation_models.csv")
    rest = res("a11_wind_or_wire", "restoration_models.csv")
    write({
        "curve": [{"chpc": r(a, 2), "pred": r(b, 3), "lo": r(c, 3), "hi": r(d, 3)}
                  for a, b, c, d in zip(mc["cust_hours_per_cust"], mc["pred_per100k"], mc["pred_lo"], mc["pred_hi"])],
        "model_A": ma.to_dict("records"),
        "two_doses": two.to_dict("records"),
        "era": era.to_dict("records"),
        "storm_slopes": ss.to_dict("records"),
        "lag": lag.to_dict("records"),
        "storm_fe": fe.to_dict("records"),
        "summary": summ,
        "cell_models": mcell.to_dict("records"),
        "cell_summary": s16,
        "mediation": med.to_dict("records"),
        "restoration": rest.to_dict("records"),
    }, "dose.json", compact=False)


def build_recovery():
    print("recovery")
    es = res("a15_recovery_autonomy", "end_cause_by_storm.csv")
    rl = res("a15_recovery_autonomy", "recovery_lead.csv")
    rs = res("a15_recovery_autonomy", "recovery_lead_summary.csv")
    at = res("a15_recovery_autonomy", "autonomy_by_tercile.csv")
    ww = res("a09_cascade_clock", "wet_well_clock.csv")
    cl = res("a16_cellular_dependency", "recovery_lead_cell.csv")
    cls = res("a16_cellular_dependency", "recovery_lead_summary_cell.csv")
    s15 = json.load(open(A / "a15_recovery_autonomy" / "results" / "summary.json"))
    es["key"] = es["window"].map(KEY_BY_NAME).fillna(es["window"].str.lower())
    write({
        "end_cause": es.to_dict("records"),
        "lead": columnar(rl, ["incident_number", "window", "county_fips", "end_class", "duration_days", "lead_days", "share_out_at_end"], 3),
        "lead_summary": rs.to_dict("records"),
        "tercile": at.to_dict("records"),
        "wet_well": columnar(ww, ["storm", "county_fips", "onset_t", "first_release_t", "buffer_days", "censored", "peak_share", "cust_hours_per_cust"], 3),
        "cell_lead": columnar(cl, ["storm", "county_fips", "cell_peak_share", "cell_peak_t", "cell_half_t", "power_peak_share", "power_peak_t", "power_half_t", "lead_half_days"], 3),
        "cell_lead_summary": cls.to_dict("records"),
        "summary": s15,
    }, "recovery.json", compact=False)


def build_adaptation():
    print("adaptation")
    pairs = res("a12_repeat_strike", "pairs.csv")
    tests = res("a12_repeat_strike", "pair_tests.csv")
    cv = res("a18_adaptation_lag", "pipeline_curves.csv")
    mat = res("a18_adaptation_lag", "closed_at_landfall.csv")
    by = res("a18_adaptation_lag", "pipeline_by_disaster.csv")
    pab = res("a18_adaptation_lag", "pa_by_storm.csv")
    ms = res("a18_adaptation_lag", "model_stock.csv")
    s18 = json.load(open(A / "a18_adaptation_lag" / "results" / "summary.json"))
    curves = {}
    for k, g in cv.groupby("storm"):
        curves[k] = {"month": g["month"].tolist(), "approved": g["approved"].astype(int).tolist(),
                     "closed": g["closed"].astype(int).tolist(), "projects": int(g["projects"].iloc[0]),
                     "closed_fed_musd": [r(v, 2) for v in g["closed_fed_musd"]]}
    write({
        "pairs": columnar(pairs, ["pair", "first", "second", "days_apart", "county_fips", "county", "h1", "h2", "n1", "n2", "rate1", "rate2", "silent1", "silent2"], 3),
        "pair_tests": tests.to_dict("records"),
        "curves": curves,
        "closed_at_landfall": mat.to_dict("records"),
        "pipeline": by.to_dict("records"),
        "pa_by_storm": pab.to_dict("records"),
        "model_stock": ms.to_dict("records"),
        "summary": {k: v for k, v in s18.items() if k in ("lee_after_ian", "county_stock", "pa")},
    }, "adaptation.json", compact=False)


def build_notices(names):
    print("notices")
    inc = res("a05_cause_and_volume", "incidents_classified.parquet")
    ec = res("a15_recovery_autonomy", "incidents_end_cause.parquet")[["incident_number", "end_class"]]
    d = inc[inc["window"].isin(ORDER) & (inc["category"] == "sewer")].merge(ec, on="incident_number", how="left")
    d = d.sort_values(["window", "release_start"])
    d["start"] = pd.to_datetime(d["release_start"]).dt.strftime("%Y-%m-%d")
    d["end"] = pd.to_datetime(d["release_end"]).dt.strftime("%Y-%m-%d")
    d["reported"] = pd.to_datetime(d["first_report"]).dt.strftime("%Y-%m-%d %H:%M")
    d["county"] = d["county_fips"].map(names).fillna(d["county_name"])
    d["text"] = d["narrative"].fillna("").str.replace(r"\s+", " ", regex=True).str.slice(0, 700)
    d["name"] = d["incident_name"].fillna("").str.slice(0, 120)
    d["facility"] = d["facility"].fillna("").str.slice(0, 80)
    d["gallons"] = d["gallons"]
    cols = ["incident_number", "window", "county_fips", "county", "name", "facility", "city", "start", "end",
            "reported", "duration_h", "report_lag_h", "cause", "end_class", "asset", "medium", "gallons",
            "lat", "lon", "text"]
    cb = res("a05_cause_and_volume", "cause_by_storm.csv")
    cb["key"] = cb["window"].map(KEY_BY_NAME).fillna("baseline")
    ab = res("a05_cause_and_volume", "asset_by_storm.csv")
    ab["key"] = ab["window"].map(KEY_BY_NAME).fillna("baseline") if "window" in ab else "baseline"
    terms = res("a05_cause_and_volume", "narrative_terms.csv")
    top = []
    for comp, g in terms.groupby("comparison"):
        g = g.sort_values("z", ascending=False).head(25)
        top.extend(g.to_dict("records"))
    write({
        "rows": columnar(d, cols, 2),
        "cause_by_storm": cb.to_dict("records"),
        "asset_by_storm": ab.to_dict("records"),
        "terms": top,
    }, "notices.json")


def build_sources(names):
    print("sources")
    sources = [
        {"key": "pnp", "name": "FDEP Public Notices of Pollution (s. 403.077, F.S.)",
         "holder": "Florida Department of Environmental Protection",
         "what": "Every reportable pollution release filed since July 2017: incident number, release start and end, facility, county, coordinates, free-text report",
         "records": "16,193 filings, 12,507 incidents, 10,811 wastewater",
         "links": [["Public portal (CAPTCHA)", "https://prodenv.dep.state.fl.us/DepPNP/reports/viewIncidentDetails"],
                   ["ArcGIS REST service (no CAPTCHA)", "https://ags.dep.state.fl.us/arcgis/rest/services/External_Services/PNP/MapServer/1"],
                   ["Statute", "https://www.flsenate.gov/Laws/Statutes/2024/403.077"]],
         "stages": ["a01", "a05", "a08", "a09", "a13", "a14", "a15"]},
        {"key": "eaglei", "name": "EAGLE-I county outage record",
         "holder": "Oak Ridge National Laboratory, U.S. Department of Energy",
         "what": "Customers without power per county every 15 minutes, 2014 to 2025, with the customer count per county (MCC)",
         "records": "about 1.0 to 1.2 million Florida records a year; 11.19 million customers",
         "links": [["Dataset (figshare)", "https://doi.org/10.6084/m9.figshare.24237376"],
                   ["Data descriptor, Scientific Data 2024", "https://doi.org/10.1038/s41597-024-03095-5"]],
         "stages": ["a02", "a03", "a10", "a16"]},
        {"key": "dirs", "name": "FCC DIRS communications status reports",
         "holder": "Federal Communications Commission, Public Safety and Homeland Security Bureau",
         "what": "Daily PDF per activated hurricane: cell sites served and out of service by county; from 2020 the cause split (damage, transport, power) and sites on backup power",
         "records": "90 reports, 2,219 Florida county-reports, 393 county-storms",
         "links": [["DIRS reports page", "https://www.fcc.gov/general/disaster-information-reporting-system-dirs-reports"],
                   ["Document store pattern", "https://docs.fcc.gov/public/attachments/DOC-346655A1.pdf"]],
         "stages": ["a16", "a17"]},
        {"key": "nclimgrid", "name": "NOAA nClimGrid-Daily county averages",
         "holder": "NOAA National Centers for Environmental Information",
         "what": "Daily county-average precipitation (mm) and mean temperature; the file id is the NCEI state code (08 for Florida) plus county number, not the FIPS",
         "records": "67 counties, every day July 2017 to August 2026",
         "links": [["Product page", "https://www.ncei.noaa.gov/products/land-based-station/nclimgrid-daily"],
                   ["County files", "https://www.ncei.noaa.gov/data/nclimgrid-daily/access/averages/"]],
         "stages": ["a03", "a04"]},
        {"key": "hurdat", "name": "HURDAT2 Atlantic best track",
         "holder": "NOAA National Hurricane Center",
         "what": "Six-hourly positions and intensities; landfall points",
         "records": "nine storms, 2017 to 2024",
         "links": [["HURDAT2", "https://www.nhc.noaa.gov/data/#hurdat"]],
         "stages": ["a07", "a13"]},
        {"key": "openfema", "name": "OpenFEMA",
         "holder": "Federal Emergency Management Agency",
         "what": "Disaster declarations (counties with Individual Assistance), Hazard Mitigation Assistance projects (type, approval, closure, federal share), Public Assistance funded projects (category, applicant, county, obligation), IHP registrations",
         "records": "828 mitigation projects and 344 category B wastewater projects for the nine storms",
         "links": [["Data sets", "https://www.fema.gov/about/openfema/data-sets"],
                   ["Hazard Mitigation Assistance Projects", "https://www.fema.gov/openfema-data-page/hazard-mitigation-assistance-projects-v3"],
                   ["Public Assistance Funded Projects Details", "https://www.fema.gov/openfema-data-page/public-assistance-funded-projects-details-v1"],
                   ["Disaster Declarations Summaries", "https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2"]],
         "stages": ["a03", "a11", "a18"]},
        {"key": "p1", "name": "Companion restoration study (track exposure, surge, damage rate, t80)",
         "holder": "the authors' Paper 1 outputs",
         "what": "County maximum wind, peak surge, FEMA registration rate and hours to restore 80 percent for seven storms",
         "records": "seven storms, 67 counties",
         "links": [["Statewide parcels (FGIO)", "https://www.floridagio.gov/maps/FGIO::florida-statewide-parcels"],
                   ["NOAA CO-OPS water levels", "https://tidesandcurrents.noaa.gov/"]],
         "stages": ["a11"]},
        {"key": "rules", "name": "Rules and programs cited",
         "holder": "State of Florida",
         "what": "Power outage contingency plan rule (62-600.705, F.A.C.), Clean Waterways Act 2020, emergency procurement (s. 287.057), FlaWARN mutual aid, AHCA generator rule",
         "records": "",
         "links": [["Rule 62-600.705 page (FDEP)", "https://floridadep.gov/water/domestic-wastewater/content/collectiontransmission-system-power-outage-contingency-plans"],
                   ["Senate Bill 712 (2020)", "https://www.flsenate.gov/Session/Bill/2020/712"],
                   ["s. 287.057 F.S.", "https://www.flsenate.gov/Laws/Statutes/2024/287.057"],
                   ["FlaWARN", "https://flawarn.pwd.aa.ufl.edu/"],
                   ["AHCA generator status", "https://bi.ahca.myflorida.com/t/ABICC/views/GeneratorStatusMap/GeneratorStatusMap"]],
         "stages": ["discussion"]},
    ]
    # the stage pipeline, from the folders on disk
    stages = []
    for folder in sorted(A.glob("a[0-9][0-9]_*")):
        results = sorted(p.name for p in (folder / "results").glob("*") if p.is_file()) if (folder / "results").exists() else []
        figs = sorted(p.stem for p in (folder / "figures").glob("*.pdf")) if (folder / "figures").exists() else []
        doc = ""
        ap = folder / "analysis.py"
        if ap.exists():
            m = re.search(r'"""(.*?)"""', ap.read_text(encoding="utf-8"), re.S)
            if m:
                doc = m.group(1).strip().split("\n\n")[0].replace("\n", " ")
                doc = re.sub(r"\s+", " ", doc)
        stages.append({"stage": folder.name, "purpose": doc, "results": results, "figures": figs})
    # figure map from collect_figures.py
    spec = importlib.util.spec_from_file_location("cf", PAPER / "03_manuscripts" / "collect_figures.py")
    cf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cf)
    figmap = [{"figure": k, "stage": v[0], "file": v[1]} for k, v in cf.FIGURES.items()]
    write({"sources": sources, "stages": stages, "figures": figmap}, "sources.json", compact=False)


def build_meta(names, w):
    print("meta")
    ss = res("a07_florida_map", "storm_summary.csv").set_index("storm")
    sig = res("a17_resilience_signature", "signature.csv")
    s04 = json.load(open(A / "a04_dose_response" / "results" / "model_summary.json"))
    s16 = json.load(open(A / "a16_cellular_dependency" / "results" / "summary.json"))
    s15 = json.load(open(A / "a15_recovery_autonomy" / "results" / "summary.json"))
    s18 = json.load(open(A / "a18_adaptation_lag" / "results" / "summary.json"))
    t1 = res("a01_pnp_incidents", "county_baseline.csv")
    storms = {}
    for k in ORDER:
        s = ss.loc[k]
        g = w[w["storm"] == k]
        storms[k] = {"label": LABEL[k], "year": YEAR[k], "name": NAMES[k], "color": COLOR[k],
                     "landfall": str(s["landfall"]), "vmax": r(s["landfall_vmax_kt"], 0),
                     "dr": DR[k], "era": ERA[k], "ia_counties": int(s["ia_counties"]),
                     "n_sewer": int(g["n_sewer"].sum()), "excess": r(g["excess_sewer"].sum(), 0),
                     "n_power": int(g["n_power"].sum()), "cust_hours_m": r(g["cust_hours"].sum() / 1e6, 1),
                     "rain_median_mm": r(g["prcp_mm"].median(), 0),
                     "cell_peak_share": r(g["cell_peak_share"].max(), 3),
                     "silent": str(s["silent_counties"]) if pd.notna(s["silent_counties"]) else ""}
    ma = res("a04_dose_response", "model_A_window.csv").iloc[0]
    two = res("a04_dose_response", "model_A_two_doses.csv")
    both = two[two["model"] == "outage + rain"] if "model" in two else two
    meta = {
        "title": "From grid failure to lifeline failure",
        "short_title": "Grid to lifeline",
        "subtitle": "Interactive companion to a study of cross-infrastructure dependency and resilience across nine Florida hurricanes, 2017 to 2024: sewer releases and cell-site outages measured against the same electricity outage in 67 counties.",
        "order": ORDER,
        "storms": storms,
        "counties": names,
        "vars": [{"key": k, "label": l, "group": g, "log": lg} for k, l, g, lg in VARS],
        "groups": GROUPS,
        "signature": sig.to_dict("records"),
        "headline": {
            "irr_sewer": r(ma["irr"], 2), "irr_lo": r(ma["irr_lo"], 2), "irr_hi": r(ma["irr_hi"], 2),
            "alpha": r(ma["alpha"], 3), "n_windows": int(ma["n"]),
            "irr_outage_with_rain": r(s04["two_doses"]["irr_outage_with_rain"], 2),
            "irr_rain_with_outage": r(s04["two_doses"]["irr_rain_with_outage"], 2),
            "elasticity_24h": r(s04["model_A"]["elasticity_at_24h"], 2),
            "or_cell": r(s16["propagation"]["pooled_or_per_log_dose"], 2),
            "or_cell_ci": [r(v, 2) for v in s16["propagation"]["ci"]],
            "cell_summary": s16,
            "autonomy": s15,
            "adaptation_lag": {k: v for k, v in s18.items() if k in ("lee_after_ian",)},
            "silent": s04["model_D"],
            "era": s04["model_B_era"],
        },
        "build_note": "Every number on this site is read from the analysis results; rebuild with py -3 tools/build_data.py.",
    }
    write(meta, "meta.json", compact=False)


def main():
    DATA.mkdir(exist_ok=True)
    names = build_geo()
    w = build_windows(names)
    build_days(names)
    build_dose()
    build_recovery()
    build_adaptation()
    build_notices(names)
    build_sources(names)
    build_meta(names, w)
    print("Done")


if __name__ == "__main__":
    main()
