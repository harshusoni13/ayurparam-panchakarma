// js/ccras-tools.js
// CCRAS Agni & Koshtha Assessment, Snehapana 7-Day Tracker, Samsarjana Krama & Image Compressor

export function evaluateCCRASAgni(q1, q2, q3) {
  const scores = { sama: 0, manda: 0, tikshna: 0, vishama: 0 };
  if (scores[q1] !== undefined) scores[q1] += 2;
  if (scores[q2] !== undefined) scores[q2] += 2;

  let dominant = 'sama';
  let maxScore = -1;
  for (const [key, val] of Object.entries(scores)) {
    if (val > maxScore) {
      maxScore = val;
      dominant = key;
    }
  }

  const isSaama = q3 === 'saama';

  const map = {
    sama: {
      label: isSaama ? 'समाग्नि (किन्तु सामावस्था युक्त)' : 'समाग्नि (प्राकृत)',
      badgeClass: isSaama ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400',
      advice: isSaama
        ? '⚠️ सावधानी (च.शा. 6/13): साम लक्षण उपस्थित हैं। पहले 3-5 दिन लंघन व दीपन-पाचन (चित्रकादि / शुण्ठी जल) कराएं, तत्पश्चात् स्नेहपान आरंभ करें।'
        : '✅ शोधन योग्य अग्नि: रोगी प्राकृत अग्नि में है। कोष्ठ के अनुसार सीधे अभ्यंतर स्नेहपान प्रारंभ किया जा सकता है।'
    },
    manda: {
      label: isSaama ? 'मन्दाग्नि + सामावस्था (कफप्रधान)' : 'मन्दाग्नि (कफप्रधान)',
      badgeClass: 'bg-rose-500/20 text-rose-400',
      advice: '🛑 दीपन-पाचन एवं रूक्षण अनिवार्य: मन्दाग्नि में सीधे स्नेहपान से आमवृद्धि व व्यापत् संभव है। पहले पंचकोल/त्रिकटु से दीपन-पाचन एवं आवश्यकतानुसार रूक्षण करें।'
    },
    tikshna: {
      label: isSaama ? 'तीक्ष्णाग्नि + सामावस्था' : 'तीक्ष्णाग्नि (पित्तप्रधान)',
      badgeClass: 'bg-amber-500/20 text-amber-400',
      advice: '🔥 पित्तशामक स्नेहपान: तीक्ष्णाग्नि में स्नेह शीघ्र पचता है। उत्तम/मध्यम मात्रा में तिक्तक या महातिक्तक घृत से स्नेहपान कर विरेचन श्रेष्ठ रहेगा।'
    },
    vishama: {
      label: isSaama ? 'विषमाग्नि + सामावस्था' : 'विषमाग्नि (वातप्रधान)',
      badgeClass: 'bg-sky-500/20 text-sky-400',
      advice: '🌬️ वातानुलोमक स्नेहपान: विषमाग्नि में सैंधव व पिप्पली युक्त घृत/तैल (उदा. पञ्चकोल घृत) से स्नेहपान कर बस्ति या मृदु विरेचन कराएं।'
    }
  };

  return { dominant, isSaama, ...map[dominant] };
}

export function evaluateKoshtha(q1, q2) {
  const counts = { madhyama: 0, mridu: 0, krura: 0 };
  if (counts[q1] !== undefined) counts[q1] += 2;
  if (counts[q2] !== undefined) counts[q2] += 1;

  let koshtha = 'madhyama';
  if (counts.mridu > counts.madhyama && counts.mridu >= counts.krura) koshtha = 'mridu';
  if (counts.krura > counts.madhyama && counts.krura >= counts.mridu) koshtha = 'krura';

  const guide = {
    mridu: {
      label: 'मृदु कोष्ठ (पित्तप्रधान)',
      days: 3,
      advice: 'च.सू. 13/29 अनुसार मृदु कोष्ठ में 3 दिन का स्नेहपान पर्याप्त है। ह्रस्व या मध्यम मात्रा से आरंभ करें; विरेचन शीघ्र प्रवृत्त होता है।'
    },
    madhyama: {
      label: 'मध्यम कोष्ठ (कफप्रधान / सम)',
      days: 5,
      advice: 'मध्यम कोष्ठ में 5 दिन का वर्धमान स्नेहपान (जैसे 30ml → 60ml → 90ml → 120ml → 150ml) सम्यक् स्निग्ध लक्षण उत्पन्न करता है।'
    },
    krura: {
      label: 'क्रूर कोष्ठ (वातप्रधान)',
      days: 7,
      advice: 'क्रूर कोष्ठ में 7 दिन तक वर्धमान स्नेहपान एवं सैंधव-पिप्पली अनुपान आवश्यक है। 7 दिन से अधिक स्नेह सात्म्य हो जाता है।'
    }
  };

  return { koshtha, ...guide[koshtha] };
}

export function generateSamsarjanaSchedule(shuddhiLevel) {
  const schedules = {
    NONE: 'शुद्धि स्तर चुनने पर पेया → विलेपी → अकृत/कृत यूष → अकृत/कृत मांसरस का क्रम यहाँ दिखेगा।',
    PRAVARA: `
      <div class="font-bold text-emerald-400 mb-1">प्रवर शुद्धि (8 वमन वेग / 30 विरेचन वेग) — 7 दिन / 3-3 अन्नकाल (च.सि. 1/13):</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-200">
        <div>• <strong>दिन 1 (सायं):</strong> पेया (1st अन्नकाल)</div>
        <div>• <strong>दिन 2 (प्रातः व सायं):</strong> पेया (2nd, 3rd अन्नकाल)</div>
        <div>• <strong>दिन 3 (प्रातः व सायं):</strong> विलेपी (1st, 2nd अन्नकाल)</div>
        <div>• <strong>दिन 4 (प्रातः):</strong> विलेपी (3rd) | <strong>(सायं):</strong> अकृत यूष (1st)</div>
        <div>• <strong>दिन 5 (प्रातः):</strong> अकृत यूष (2nd) | <strong>(सायं):</strong> कृत यूष (3rd)</div>
        <div>• <strong>दिन 6 (प्रातः व सायं):</strong> अकृत व कृत मांसरस / मुद्ग यूष</div>
        <div class="sm:col-span-2 text-amber-300">• <strong>दिन 7 (प्रातः व सायं):</strong> कृत मांसरस/यूष एवं सामान्य लघु आहार (8वें दिन प्राकृत भोजन)</div>
      </div>
    `,
    MADHYAMA: `
      <div class="font-bold text-amber-400 mb-1">मध्यम शुद्धि (6 वमन वेग / 20 विरेचन वेग) — 5 दिन / 2-2 अन्नकाल:</div>
      <div class="space-y-1 text-slate-200">
        <div>• <strong>दिन 1 (सायं) व दिन 2 (प्रातः):</strong> पेया (2 अन्नकाल)</div>
        <div>• <strong>दिन 2 (सायं) व दिन 3 (प्रातः):</strong> विलेपी (2 अन्नकाल)</div>
        <div>• <strong>दिन 3 (सायं) व दिन 4 (प्रातः):</strong> अकृत यूष व कृत यूष (2 अन्नकाल)</div>
        <div>• <strong>दिन 4 (सायं) व दिन 5 (प्रातः):</strong> अकृत व कृत मांसरस / लघु ओदन</div>
        <div class="text-emerald-300">• <strong>दिन 5 (सायं) से:</strong> क्रमशः प्राकृत संतुलित आहार</div>
      </div>
    `,
    AVARA: `
      <div class="font-bold text-sky-400 mb-1">अवर शुद्धि (4 वमन वेग / 10 विरेचन वेग) — 3 दिन / 1-1 अन्नकाल:</div>
      <div class="space-y-1 text-slate-200">
        <div>• <strong>दिन 1 (सायं):</strong> पेया (1 अन्नकाल)</div>
        <div>• <strong>दिन 2 (प्रातः):</strong> विलेपी | <strong>(सायं):</strong> कृत यूष</div>
        <div>• <strong>दिन 3 (प्रातः):</strong> कृत मांसरस / मुद्ग यूष | <strong>(सायं):</strong> सामान्य लघु आहार</div>
      </div>
    `
  };
  return schedules[shuddhiLevel] || schedules.NONE;
}

// Compress uploaded prescription photo so it saves cleanly in Firestore (< 350 KB)
export function compressImageToBase64(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}