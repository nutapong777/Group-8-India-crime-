"""
prepare_data.py
---------------
ขั้นตอน Data Preparation (CRISP-DM) ของโปรเจกต์ India District Crime 2014–2023

อินพุต
  data/raw/india_district_crime_2014_2023_30k.xlsx   ข้อมูลดิบ 30,000 แถว
  data/raw/result_decision_rapidminer.xlsx           ผลจาก RapidMiner (มีคอลัมน์ id + cluster จาก k-means k=4)

เอาต์พุต
  data/cleaned/india_crime_clustered.csv   ข้อมูลที่ทำความสะอาดแล้ว + cluster + ชื่อกลุ่ม
  data/cleaned/cleaning_report.json         สรุปผลการตรวจคุณภาพข้อมูล
  web/d3/data/dashboard.json                ข้อมูลสรุปสำหรับเว็บ D3.js
  web/echarts/data/dashboard.json           ข้อมูลสรุปสำหรับเว็บ ECharts (ไฟล์เดียวกัน)

รัน:  python analysis/prepare_data.py
ต้องการ: pandas, openpyxl, numpy
"""
from pathlib import Path
import json

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "india_district_crime_2014_2023_30k.xlsx"
RM_RESULT = ROOT / "data" / "raw" / "result_decision_rapidminer.xlsx"
OUT_CSV = ROOT / "data" / "cleaned" / "india_crime_clustered.csv"
OUT_REPORT = ROOT / "data" / "cleaned" / "cleaning_report.json"
# each site is self-contained, so the same JSON is written into both
OUT_JSONS = [ROOT / "web" / "d3" / "data" / "dashboard.json", ROOT / "web" / "echarts" / "data" / "dashboard.json"]

CLUSTER_VARS = ["Chargesheet_Rate", "Convictions_Rate", "Crime_Rate_per_100k", "Justice_index"]

# ชื่อกลุ่มตั้งจากโปรไฟล์ค่าเฉลี่ยของแต่ละ cluster (ดูตาราง cluster_profile ใน cleaning_report.json)
CLUSTER_NAMES = {
    "cluster_0": ("ยุติธรรมสูง", "High justice",
                  "ฟ้องและลงโทษได้สูง อัตราอาชญากรรมปานกลาง ดัชนีความยุติธรรมสูงที่สุด"),
    "cluster_1": ("บังคับใช้อ่อน", "Weak enforcement",
                  "อัตราฟ้องและอัตราลงโทษต่ำที่สุด เป็นกลุ่มที่ใหญ่ที่สุด"),
    "cluster_2": ("อาชญากรรมหนาแน่น", "High crime density",
                  "อัตราอาชญากรรมต่อแสนคนสูงมาก ส่วนใหญ่เป็นอำเภอประชากรน้อย"),
    "cluster_3": ("เสี่ยงต่ำ", "Low crime, efficient",
                  "อัตราอาชญากรรมต่ำที่สุด แต่ฟ้องได้สูง ดัชนีความยุติธรรมต่ำเพราะจำนวนคดีน้อย"),
}


def load_and_clean() -> tuple[pd.DataFrame, dict]:
    raw = pd.read_excel(RAW)
    report = {"raw_rows": int(len(raw)), "raw_columns": list(raw.columns)}

    df = raw.copy()
    # 1) ตัดช่องว่างในข้อความ
    for c in ["State", "District", "Crime_Type"]:
        df[c] = df[c].astype(str).str.strip()

    # 2) ค่าว่าง / แถวซ้ำ
    report["missing_values"] = {k: int(v) for k, v in df.isna().sum().items()}
    report["duplicate_rows"] = int(df.duplicated().sum())
    report["duplicate_keys"] = int(df.duplicated(["State", "District", "Year", "Crime_Type"]).sum())
    df = df.dropna().drop_duplicates()

    # 3) ตรวจความสมเหตุสมผลเชิงตรรกะ
    bad = (
        (df.Chargesheeted > df.Cases_Reported)
        | (df.Convictions > df.Chargesheeted)
        | (~df.Chargesheet_Rate.between(0, 100))
        | (~df.Convictions_Rate.between(0, 100))
        | (df.Population <= 0)
    )
    report["logically_invalid_rows"] = int(bad.sum())
    df = df[~bad]

    # 4) ตรวจว่าอัตราที่ให้มาตรงกับค่าที่คำนวณใหม่
    report["max_abs_diff"] = {
        "Chargesheet_Rate": float((df.Chargesheeted / df.Cases_Reported * 100 - df.Chargesheet_Rate).abs().max()),
        "Crime_Rate_per_100k": float((df.Cases_Reported / df.Population * 1e5 - df.Crime_Rate_per_100k).abs().max()),
    }

    # 5) แนบผล cluster จาก RapidMiner (Generate ID เริ่มที่ 1 ตามลำดับแถวของไฟล์ดิบ)
    rm = pd.read_excel(RM_RESULT)[["id", "cluster", "Cases_Reported", "Year"]].sort_values("id")
    df = df.reset_index(drop=True)
    df.insert(0, "id", np.arange(1, len(df) + 1))
    merged = df.merge(rm, on="id", suffixes=("", "_rm"), how="inner")
    report["join_check_cases_match"] = bool((merged.Cases_Reported == merged.Cases_Reported_rm).all())
    report["join_check_year_match"] = bool((merged.Year == merged.Year_rm).all())
    merged = merged.drop(columns=["Cases_Reported_rm", "Year_rm"])
    merged["Cluster_Name_TH"] = merged.cluster.map(lambda c: CLUSTER_NAMES[c][0])
    merged["Cluster_Name_EN"] = merged.cluster.map(lambda c: CLUSTER_NAMES[c][1])
    report["clean_rows"] = int(len(merged))
    return merged, report


def build_dashboard(df: pd.DataFrame, report: dict) -> dict:
    states = sorted(df.State.unique())
    crimes = sorted(df.Crime_Type.unique())
    years = sorted(int(y) for y in df.Year.unique())
    clusters = sorted(df.cluster.unique())
    si = {s: i for i, s in enumerate(states)}
    ci = {c: i for i, c in enumerate(crimes)}

    # --- cube: state x crime x year (ใช้กรองและรวมค่าฝั่งเว็บ) ---
    g = df.groupby(["State", "Crime_Type", "Year"])
    agg = g[["Cases_Reported", "Chargesheeted", "Convictions", "Population"]].sum()
    cnt = df.pivot_table(index=["State", "Crime_Type", "Year"], columns="cluster",
                         values="id", aggfunc="count", fill_value=0).reindex(columns=clusters, fill_value=0)
    cube = agg.join(cnt).reset_index()
    cube_rows = [
        [si[r.State], ci[r.Crime_Type], int(r.Year), int(r.Cases_Reported), int(r.Chargesheeted),
         int(r.Convictions), int(r.Population)] + [int(r[c]) for c in clusters]
        for _, r in cube.iterrows()
    ]

    # --- cluster profile (ค่าเฉลี่ยจริง + z-score เทียบค่าเฉลี่ยรวม) ---
    mu, sd = df[CLUSTER_VARS].mean(), df[CLUSTER_VARS].std()
    prof = df.groupby("cluster")[CLUSTER_VARS].mean()
    cl_out = []
    for c in clusters:
        th, en, desc = CLUSTER_NAMES[c]
        cl_out.append({
            "id": c, "name": th, "name_en": en, "desc": desc,
            "n": int((df.cluster == c).sum()),
            "mean": {v: round(float(prof.loc[c, v]), 2) for v in CLUSTER_VARS},
            "z": {v: round(float((prof.loc[c, v] - mu[v]) / sd[v]), 3) for v in CLUSTER_VARS},
        })
    report["cluster_profile"] = {c["id"]: c["mean"] | {"n": c["n"]} for c in cl_out}

    # --- sample สำหรับ scatter (stratified 3,000 จุด, seed คงที่) ---
    samp = pd.concat([x.sample(frac=3000 / len(df), random_state=42) for _, x in df.groupby("cluster")])
    sample_rows = [
        [si[r.State], ci[r.Crime_Type], int(r.Year), round(float(r.Crime_Rate_per_100k), 2),
         round(float(r.Justice_index), 2), round(float(r.Convictions_Rate), 1), clusters.index(r.cluster), r.District]
        for r in samp.itertuples(index=False)
    ]

    return {
        "meta": {
            "title": "India District Crime 2014–2023",
            "rows": int(len(df)), "districts": int(df.District.nunique()),
            "source": "india_district_crime_2014_2023_30k.xlsx + RapidMiner k-means (k=4)",
            "cube_fields": ["state", "crime", "year", "cases", "chargesheeted", "convictions", "population"]
                           + clusters,
            "sample_fields": ["state", "crime", "year", "crime_rate", "justice_index", "conviction_rate",
                              "cluster", "district"],
        },
        "states": states, "crimes": crimes, "years": years,
        "clusters": cl_out, "cube": cube_rows, "sample": sample_rows,
    }


def main() -> None:
    df, report = load_and_clean()
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    dash = build_dashboard(df, report)
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for out in OUT_JSONS:
        out.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(dash, ensure_ascii=False, separators=(",", ":"))
        out.write_text(payload, encoding="utf-8")
        # same data as a script, so index.html also opens by double-click (browsers block fetch on file://)
        out.with_suffix(".js").write_text("window.__DATA__ = " + payload + ";\n", encoding="utf-8")
    print(f"cleaned rows: {report['clean_rows']:,}")
    print(f"wrote {OUT_CSV.relative_to(ROOT)}, {OUT_REPORT.relative_to(ROOT)}, " + ", ".join(str(o.relative_to(ROOT)) for o in OUT_JSONS))
    print(json.dumps(report["cluster_profile"], indent=1))


if __name__ == "__main__":
    main()
