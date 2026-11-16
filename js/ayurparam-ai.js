// js/ayurparam-ai.js
// Client-Side Samhita RAG Retriever + Direct Gemini Synthesis Engine

let cachedCorpus = null;

export async function loadSamhitaCorpus() {
  if (cachedCorpus) return cachedCorpus;
  try {
    const response = await fetch('./js/samhita-rag.json');
    cachedCorpus = await response.json();
    return cachedCorpus;
  } catch (err) {
    console.error('Failed to load Samhita RAG corpus:', err);
    return [];
  }
}

export async function retrieveRelevantShlokas(caseData, customQuery = '', topK = 5) {
  const corpus = await loadSamhitaCorpus();
  if (!corpus.length) return [];

  // Build search tokens from patient state + active procedures + custom question
  const contextString = [
    caseData.diagnosis || '',
    caseData.complaints || '',
    caseData.agniResult || '',
    caseData.koshthaResult || '',
    caseData.jihva || '',
    caseData.mala || '',
    caseData.rukshanaStatus !== 'NOT_NEEDED' ? 'रूक्षण उद्वर्तन आम' : '',
    caseData.snehapanaStatus !== 'PLANNED' ? 'स्नेहन सम्यक् स्निग्ध स्नेहपान' : '',
    caseData.swedanaStatus !== 'PLANNED' ? 'स्वेदन सम्यक् स्वेद' : '',
    caseData.vamanaStatus !== 'NOT_PLANNED' ? 'वमन मदनफल वेग पित्तान्त' : '',
    caseData.virechanaStatus !== 'NOT_PLANNED' ? 'विरेचन वेग कफान्त' : '',
    caseData.samsarjanaShuddhi !== 'NONE' ? 'संसर्जन क्रम पेया विलेपी' : '',
    caseData.bastiStatus !== 'NOT_PLANNED' ? 'बस्ति योग काल कर्म निरूह अनुवासन' : '',
    caseData.nasyaStatus !== 'NOT_PLANNED' ? 'नस्य शिरोविरेचन अणु तैल' : '',
    caseData.raktaStatus !== 'NOT_PLANNED' ? 'रक्तमोक्षण जलौका सिरावेध' : '',
    caseData.upakarmaStatus !== 'NOT_PLANNED' ? 'उपकर्म शिरोधारा नेत्र तर्पण' : '',
    ...(caseData.lifestyle || []),
    customQuery
  ]
    .join(' ')
    .toLowerCase();

  const scored = corpus.map((item) => {
    let score = 0;
    const keywords = item.keywords || [];
    keywords.forEach((kw) => {
      if (contextString.includes(kw.toLowerCase())) {
        score += 3;
      }
    });
    if (customQuery && item.meaning.toLowerCase().includes(customQuery.toLowerCase())) {
      score += 4;
    }
    if (contextString.includes(item.sthana.toLowerCase())) {
      score += 1;
    }
    return { ...item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function runAyurParamSynthesis(caseData, customQuery, apiKey) {
  const retrievedChunks = await retrieveRelevantShlokas(caseData, customQuery, 5);

  if (!apiKey) {
    return {
      chunks: retrievedChunks,
      htmlReport: `
        <div class="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 space-y-2">
          <div class="font-bold">⚠️ Super Admin Gemini API Key सेट नहीं है (Local RAG Mode Active):</div>
          <p>ऊपर दिखाए गए संहिता श्लोक चंक्स सीधे आपकी <strong>चरक संहिता एवं अष्टांग हृदय RAG लाइब्रेरी</strong> से निकाले गए हैं। पूर्ण AI संप्राप्ति विघातन व मॉडर्न पैथोफिजियोलॉजी संश्लेषण के लिए Main Doctor / Super Admin को ऊपर <strong>"AI & Admin Config"</strong> में Gemini API Key सेव करनी होगी।</p>
        </div>
      `
    };
  }

  const ragContextText = retrievedChunks
    .map(
      (c, idx) =>
        `[${idx + 1}] ${c.samhita} (${c.sthana} - ${c.adhyaya}):\nश्लोक: ${c.shloka}\nअर्थ: ${c.meaning}\nModern Correlation: ${c.modern_correlation}`
    )
    .join('\n\n');

  const prompt = `
You are "AyurParam", an authoritative Ayurvedic Panchakarma & Integrative Clinical Copilot built for OPD/IPD doctors and postgraduate scholars.
Strictly ground your response in the retrieved Samhita RAG verses provided below AND correlate each classical step with modern pathophysiology/biochemistry. Respond in clear, scholarly Hindi + English medical terms (Devanagari for Hindi & Sanskrit shlokas).

### PATIENT CLINICAL PROFILE:
- Name/Age/Sex: ${caseData.name || 'Patient'} (${caseData.ageSex || 'N/A'})
- Diagnosis: ${caseData.diagnosis || 'Not specified'}
- Chief Complaints: ${caseData.complaints || 'Not specified'}
- Lifestyle/Nidana: ${(caseData.lifestyle || []).join(', ') || 'None noted'}
- Ashtavidha: Jihva=${caseData.jihva || 'N/A'}, Mala=${caseData.mala || 'N/A'}, Nadi=${caseData.nadi || 'N/A'}
- CCRAS Agni: ${caseData.agniResult || 'N/A'}
- Koshtha: ${caseData.koshthaResult || 'N/A'}
- Planned/Active Panchakarma:
  * Rukshana: ${caseData.rukshanaStatus} (${caseData.rukshanaDrug || ''})
  * Snehapana: ${caseData.snehapanaStatus} (${caseData.snehapanaDrug || ''})
  * Swedana: ${caseData.swedanaStatus} (${caseData.swedanaType || ''})
  * Vamana: ${caseData.vamanaStatus} | Virechana: ${caseData.virechanaStatus}
  * Basti: ${caseData.bastiStatus} (${caseData.bastiType || ''}) | Nasya: ${caseData.nasyaStatus} (${caseData.nasyaType || ''})
  * Raktamokshana: ${caseData.raktaStatus} | Upakarma: ${caseData.upakarmaStatus} (${(caseData.upakarmaList || []).join(', ')})
- Lab/History Notes: ${caseData.historyNotes || 'None'}

### RETRIEVED SAMHITA RAG CHUNKS (USE THESE CITATIONS):
${ragContextText}

### SPECIFIC CLINICAL QUESTION:
${customQuery || 'इस रोगी की संप्राप्ति विघातन योजना, शोधन अर्हता, अपेक्षित संहिता प्रमाण और मॉडर्न फिजियोलॉजिकल मैकेनिज्म का विस्तृत विश्लेषण करें।'}

### OUTPUT FORMAT (Use clean HTML tags like <h4>, <p>, <ul>, <li>, <strong>):
1. <h4>१. शास्त्रीय संप्राप्ति एवं संहिता प्रमाण (Samhita Grounding)</h4>
2. <h4>२. संप्राप्ति विघातन व पंचकर्म युक्ति (Why this Protocol Breaks the Disease Chain)</h4>
3. <h4>३. मॉडर्न पैथोफिजियोलॉजी एवं बायोकेमिकल कोरिलेशन (Modern Scientific Link)</h4>
4. <h4>४. क्लिनिकल सावधानियां एवं संभावित व्यापत् निवारण (Safety & Contraindications)</h4>
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1800 }
        })
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Gemini API Error');
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    // Clean markdown code fences if present
    const cleanedHtml = rawText.replace(/```html/gi, '').replace(/```/g, '').trim();

    return {
      chunks: retrievedChunks,
      htmlReport: cleanedHtml
    };
  } catch (error) {
    return {
      chunks: retrievedChunks,
      htmlReport: `<div class="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300"><strong>AI Connection Error:</strong> ${error.message}</div>`
    };
  }
}