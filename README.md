# India District Crime 2014–2023 · Interactive Data Visualization

โปรเจกต์วิชา Data Visualization Technology นำเสนอข้อมูลอาชญากรรมระดับอำเภอของอินเดีย (12 รัฐ 300 อำเภอ 10 ประเภทคดี ปี 2014–2023 รวม 30,000 แถว)
พร้อมผลการจัดกลุ่ม k-means (k = 4) จาก RapidMiner บนเว็บ 2 เวอร์ชันที่ใช้ข้อมูลชุดเดียวกัน

| เวอร์ชัน | โฟลเดอร์ | บทบาท |
|---|---|---|
| **D3.js v7** | `web/d3/` | เวอร์ชันหลัก |
| **Apache ECharts 5** | `web/echarts/` | framework ที่สอง ใช้เปรียบเทียบ |

สองเว็บ**แยกกันสมบูรณ์** แต่ละโฟลเดอร์มี `index.html`, `style.css`, `common.js`, `charts.js` และ `data/` ของตัวเอง ไม่อ้างไฟล์ข้ามโฟลเดอร์
ทั้งสองใช้ดีไซน์ ตัวกรอง และข้อมูลชุดเดียวกัน ต่างกันเฉพาะ `charts.js` การเปรียบเทียบจึงวัดความต่างของเครื่องมือได้ตรง ๆ

## โครงสร้างไฟล์

```
.
├── data/
│   ├── raw/                              ข้อมูลดิบ
│   │   ├── india_district_crime_2014_2023_30k.xlsx
│   │   └── result_decision_rapidminer.xlsx      ผลจาก RapidMiner (id + cluster)
│   └── cleaned/                          ข้อมูลที่ทำความสะอาดแล้ว
│       ├── india_crime_clustered.csv            30,000 แถว + cluster + ชื่อกลุ่ม
│       └── cleaning_report.json                 ผลตรวจคุณภาพข้อมูล และโปรไฟล์ cluster
├── analysis/                             สคริปต์/ไฟล์วิเคราะห์ข้อมูล
│   ├── prepare_data.py                          ทำความสะอาด + แนบ cluster + สร้าง JSON ให้ทั้งสองเว็บ
│   ├── build_standalone.py                      รวมแต่ละเว็บเป็น HTML ไฟล์เดียวใน dist/
│   └── rapidminer/
│       ├── decision_tree.rmp
│       └── random_forest.rmp
├── web/
│   ├── d3/                               เว็บเวอร์ชัน D3.js (ใช้งานได้ด้วยตัวเอง)
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── common.js                     ตัวกรอง KPI ตาราง การรวมข้อมูล
│   │   ├── charts.js                     โค้ดวาดกราฟด้วย D3.js
│   │   └── data/ dashboard.json, india_states.geojson
│   └── echarts/                          เว็บเวอร์ชัน ECharts (ใช้งานได้ด้วยตัวเอง)
│       ├── index.html
│       ├── style.css
│       ├── common.js
│       ├── charts.js                     โค้ดวาดกราฟด้วย ECharts
│       └── data/ dashboard.json, india_states.geojson
├── dist/                                 ไฟล์ HTML ไฟล์เดียว ดับเบิลคลิกเปิดได้
│   ├── india-crime-d3.html
│   └── india-crime-echarts.html
├── server/serve.py                       เว็บเซิร์ฟเวอร์ Python + API
├── requirements.txt
└── README.md
```

## วิธีรัน

**แบบง่ายที่สุด** ดับเบิลคลิก `dist/india-crime-d3.html` หรือ `dist/india-crime-echarts.html` (ต้องต่ออินเทอร์เน็ตเพื่อโหลดไลบรารีจาก cdnjs)

**แบบเซิร์ฟเวอร์ Python** รันทีละเว็บ หรือเปิดสองหน้าต่างพร้อมกัน

```bash
python server/serve.py --site d3                   # http://localhost:8000
python server/serve.py --site echarts --port 8001  # http://localhost:8001
```

แต่ละเว็บมี API ของตัวเอง เช่น `/api/summary?state=Kerala&crime=Murder` และ `/api/clusters`

> ถ้าเปิด `web/d3/index.html` หรือ `web/echarts/index.html` ด้วยการดับเบิลคลิก เบราว์เซอร์จะบล็อกการโหลด JSON
> ให้ใช้เซิร์ฟเวอร์ข้างบน, Live Server ของ VS Code หรือ `python -m http.server -d web/d3` แทน
> ถ้า deploy บน GitHub Pages จะได้สองลิงก์แยกกัน คือ `.../web/d3/` และ `.../web/echarts/`

**สร้างข้อมูลและไฟล์ dist ใหม่**

```bash
pip install -r requirements.txt
python analysis/prepare_data.py       # data/raw -> data/cleaned + web/*/data/dashboard.json
python analysis/build_standalone.py   # web/d3, web/echarts -> dist/*.html
```

## CRISP-DM โดยย่อ

1. **Business Understanding** ต้องการดูว่ารัฐและประเภทคดีใดมีอัตราอาชญากรรมสูง และกระบวนการยุติธรรม (สั่งฟ้อง → ลงโทษ) มีประสิทธิภาพแค่ไหน
2. **Data Understanding** 12 คอลัมน์ ไม่มีค่าว่าง ไม่มีแถวซ้ำ ข้อมูลครบทุกชุด อำเภอ × ปี × ประเภทคดี (300 × 10 × 10)
3. **Data Preparation** (`analysis/prepare_data.py`) ตัดช่องว่าง ตรวจค่าว่างและแถวซ้ำ ตรวจตรรกะ (ฟ้อง ≤ รับแจ้ง, ลงโทษ ≤ ฟ้อง, อัตราอยู่ในช่วง 0–100)
   ตรวจว่าอัตราที่ให้มาตรงกับค่าที่คำนวณใหม่ แล้วแนบ cluster จาก RapidMiner ด้วย `id` (ตรวจซ้ำว่า Cases_Reported และ Year ตรงกันทุกแถว)
4. **Modeling** (RapidMiner) Z-transform ตัวแปร 4 ตัว แล้ว k-means k = 4 ได้ 4 กลุ่ม

   | cluster | ชื่อที่ตั้ง | แถว | สั่งฟ้อง % | ลงโทษ % | อาชญากรรม/แสน | Justice index |
   |---|---|---:|---:|---:|---:|---:|
   | cluster_0 | ยุติธรรมสูง | 5,384 | 85.5 | 52.3 | 26.4 | 43.0 |
   | cluster_1 | บังคับใช้อ่อน | 12,275 | 72.5 | 36.6 | 15.1 | 10.3 |
   | cluster_2 | อาชญากรรมหนาแน่น | 2,895 | 78.5 | 41.6 | 65.7 | 29.9 |
   | cluster_3 | เสี่ยงต่ำ | 9,446 | 86.4 | 48.9 | 11.5 | 8.3 |

5. **Evaluation / Deployment** นำเสนอบนเว็บ 2 เวอร์ชัน

## นิยามตัวชี้วัดบนเว็บ

- **อัตราสั่งฟ้อง** = Chargesheeted ÷ Cases_Reported และ **อัตราลงโทษ** = Convictions ÷ Cases_Reported (ตรงกับคอลัมน์ในข้อมูลดิบ)
- **อัตราอาชญากรรม** = คดีต่อประชากรแสนคนต่อปี คอลัมน์ Population ซ้ำทุกประเภทคดี จึงหารด้วยจำนวนประเภทคดีที่เลือกก่อน
- ค่าเฉลี่ยในโปรไฟล์ cluster เป็นค่าของทั้งชุดข้อมูล ส่วนจำนวนแถวต่อกลุ่มเปลี่ยนตามตัวกรอง

## การจัดสรรกราฟ

| คำถาม | กราฟ | เหตุผล |
|---|---|---|
| ภาพรวม | KPI 4 ช่อง | ตัวเลขเดี่ยวอ่านเร็วที่สุด |
| การกระจายตัวตามภูมิศาสตร์ | แผนที่ Choropleth + แท่งเรียงลำดับคู่กัน | แผนที่บอกตำแหน่ง แท่งให้ค่าที่แม่นกว่าสี เลือกตัวชี้วัดได้ 4 แบบ |
| แนวโน้มจำนวนคดี | เส้น + พื้นที่ | อนุกรมเวลา แกน Y เริ่มที่ 0 |
| อัตราสั่งฟ้อง vs ลงโทษ | เส้น 2 เส้น แกนเดียว | หน่วยเดียวกัน (%) จึงไม่ใช้ 2 แกน |
| ปลายทางของคดี | แท่งซ้อน 100% | ส่วนของทั้งหมด ใช้สีไล่ระดับเพราะเป็นลำดับขั้น |
| รัฐ × ประเภทคดี | Heatmap | ข้อมูล 2 มิติ 120 ช่อง |
| ลักษณะ cluster | ตาราง + แท่งกลุ่มบน Z-score | ตัวแปรต่างหน่วย จึงใช้ Z-score |
| cluster ในแต่ละรัฐ | แท่งซ้อน 100% | ส่วนประกอบ 4 กลุ่ม |
| การแยกตัวของ cluster | Scatter small multiples | 4 สีในกราฟเดียวแยกยากสำหรับผู้ตาบอดสี จึงแยกแผง |

กราฟทุกตัวมี tooltip และคลิกกราฟรัฐ ประเภทคดี แผนที่ หรือ heatmap เพื่อกรองทั้งหน้าได้ ธีมพื้นขาว รองรับหน้าจอมือถือ
สีหมวดหมู่ของ cluster ผ่านการตรวจความแยกแยะได้สำหรับผู้ตาบอดสี (CVD) บนพื้นขาว

## เปรียบเทียบ D3.js กับ ECharts (วัดจากโปรเจกต์นี้)

| ประเด็น | D3.js v7 | ECharts 5 |
|---|---|---|
| โค้ดวาดกราฟ 9 ชิ้น (ไม่นับบรรทัดว่าง/คอมเมนต์) | 348 บรรทัด | **265 บรรทัด** |
| ขนาดไลบรารี (min + gzip) | **~93 KB** | ~334 KB |
| เวลาวาดใหม่เมื่อเปลี่ยนตัวกรอง (Chromium, 1280px, มัธยฐาน) | **~42 ms** | ~130 ms |
| Tooltip / crosshair | เขียนเอง (pointer events, Delaunay) | มีในตัว (`trigger: "axis"`) |
| แผนที่ | เลือก projection เอง และต้องเรียงทิศทางจุด polygon ให้ตรงกับ D3 | `registerMap` + series `map` + `visualMap` |
| แอนิเมชัน / resize | จัดการเอง | มีในตัว |
| ความยืดหยุ่น | สูงมาก ควบคุมทุกองค์ประกอบ SVG | อยู่ในขอบเขตของ option |
| การเรียนรู้ | ยาก ต้องเข้าใจ scale, selection, data join | ง่ายกว่า อ่านเอกสาร option ได้เลย |

### ข้อดี / ข้อเสีย

| เครื่องมือ | ข้อดี | ข้อเสีย |
|---|---|---|
| **D3.js v7** | ควบคุมได้ทุกองค์ประกอบ ออกแบบกราฟใหม่ได้ไม่จำกัด · ไลบรารีเล็ก วาดเร็ว · ปรับรายละเอียดได้ละเอียด · มี projection แผนที่และ Delaunay | ต้องเขียนแกน tooltip legend แอนิเมชัน resize เอง · โค้ดยาว พัฒนานาน · เรียนรู้ยาก · แผนที่ต้องเตรียมข้อมูลเอง |
| **ECharts 5** | เขียนด้วย option object สั้นและเร็ว · มี tooltip legend แอนิเมชัน visualMap ในตัว · แผนที่ใช้ registerMap ได้ทันที · เรียนรู้ง่าย | ไลบรารีใหญ่ · วาดใหม่ช้ากว่า · ปรับได้เท่าที่ option รองรับ · small multiples ต้องคำนวณตำแหน่งเอง |

ตารางนี้แสดงอยู่ท้ายหน้าเว็บทั้งสองเว็บด้วย (คอลัมน์ของเครื่องมือที่กำลังดูอยู่จะถูกไฮไลต์)

**สรุป** D3.js เหมาะกับงานที่ต้องออกแบบกราฟเอง ต้องการไฟล์เล็กและเร็ว แลกกับโค้ดที่ยาวกว่าและเรียนรู้ยากกว่า
ECharts เหมาะกับแดชบอร์ดที่ต้องการกราฟมาตรฐานจำนวนมากอย่างรวดเร็ว ได้ tooltip แอนิเมชัน และ interaction มาพร้อม แลกกับไลบรารีที่ใหญ่กว่าและปรับรายละเอียดได้น้อยกว่า

## ข้อสังเกตเรื่องโมเดล (RapidMiner)

- label `cluster` มาจาก k-means บน Chargesheet_Rate, Convictions_Rate, Crime_Rate_per_100k และ Justice_index
  แต่ในขั้น Decision Tree / Random Forest ยังใส่ Chargesheet_Rate และ Convictions_Rate เป็น feature ด้วย
  และ Crime_Rate_per_100k คำนวณได้จาก Cases_Reported ÷ Population ซึ่งอยู่ใน feature เช่นกัน จึงมี data leakage
- ไฟล์ `result_decision_rapidminer.xlsx` ต่อจากพอร์ต example set ของ Cross Validation จึงไม่มีคอลัมน์ `prediction(cluster)`
  ถ้าต้องการผลทำนาย ให้ต่อ Write Excel จากพอร์ต test result set

## แผนที่

ขอบเขตรัฐมาจาก Natural Earth `ne_10m_admin_1_states_provinces` (public domain) กรองเฉพาะอินเดีย 36 รัฐ/ดินแดน
ย่อด้วย `mapshaper -simplify 8% keep-shapes` แล้วเรียงทิศทางจุดของ polygon ให้วงนอกหมุนตามเข็มนาฬิกา (รูปแบบที่ D3 ต้องการ)
มีข้อมูลเพียง 12 รัฐ รัฐอื่นแสดงเป็นสีเทา เส้นเขตแดนใช้เพื่อการแสดงผลเท่านั้น ไม่ใช่เส้นเขตแดนทางการ

## เทคโนโลยี

HTML / CSS / JavaScript · D3.js 7.9.0 · Apache ECharts 5.5.0 (โหลดจาก cdnjs) · Python 3 (pandas, openpyxl) · RapidMiner Studio 10.5
