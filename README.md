\# AyurParam: Integrative Panchakarma OPD/IPD \& Samhita RAG Clinical Engine



\*\*AyurParam\*\* is a zero-latency, offline-capable clinical decision support and Panchakarma ward management system built for Ayurvedic OPD/IPD units. It bridges classical \*\*Charaka Samhita (all 8 Sthanas)\*\* and \*\*Ashtanga Hridaya (all 6 Sthanas)\*\* with modern pathophysiological correlations.



\## Core Architecture \& Features

1\. \*\*Role-Based Firebase Authentication \& Real-Time Sync\*\*:

&#x20;  - \*\*Main Doctor / Consultant Super Admin\*\*: Monitors 50+ scholars in real time, tracks `LIVE` IPD procedures vs. `OPD` cases, reviews prescription uploads, and adds consultant remarks.

&#x20;  - \*\*OPD/IPD Scholars\*\*: Rapid tap-tap clinical intake with offline Firestore persistence.

2\. \*\*CCRAS-Aligned Agni \& Koshtha Diagnostic Engine\*\*:

&#x20;  - Algorithmic evaluation of \*Abhyavaharana Shakti\*, \*Jarana Shakti\*, \*Saama/Nirama\* status, and \*Koshtha\* with automated Snehapana duration recommendations.

3\. \*\*Complete Panchakarma, Nasya \& Upakarma Lifecycle\*\*:

&#x20;  - \*\*Purvakarma\*\*: Rukshana log, 7-day escalating Abhyantara Snehapana tracker, Samyak Snigdha checklist, and Swedana log.

&#x20;  - \*\*Pradhan Karma\*\*: Vamana \& Virechana Vega/Antiki trackers, automated 7/5/3-day \*Samsarjana Krama\* diet planner, Basti (Yoga/Kala/Karma) daily log, Nasya (Shirovirechana), Raktamokshana, and Upakarma (Shirodhara, Udvartana, PPS, Netra Tarpana).

4\. \*\*Client-Side Samhita RAG \& AyurParam AI\*\*:

&#x20;  - Retrieves grounded Sanskrit verses and clinical meanings from local JSON corpora and synthesizes \*Samprapti Vighatana\* with modern biochemical correlations via Google Gemini.



\## Deployment (Netlify)

1\. Push repository to GitHub.

2\. Connect repository to Netlify (Publish directory: `/`, No build command required).

3\. Add Netlify domain to Firebase Authentication -> Authorized Domains.

