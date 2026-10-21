// Map common grocery Gujarati tokens to English phonetic variations and vice versa
export const PHONETIC_DICTIONARY: Record<string, string[]> = {
  "મસુર": ["masoor", "masur", "masurdaal", "masoordal"],
  "દાળ": ["dal", "daal", "dhal"],
  "મગ": ["moong", "mag", "mug"],
  "મગદાળ": ["moongdal", "magdal", "moongfada"],
  "ચણા": ["chana", "chana dal", "channa"],
  "તુવેર": ["tuver", "tuvar", "toor"],
  "અડદ": ["udad", "urad"],
  "જીરું": ["jeera", "jeeru", "cumin"],
  "હળદર": ["haldi", "turmeric"],
  "રાય": ["rai", "mustard"],
  "મેથી": ["methi", "fenugreek"],
  "તેલ": ["oil", "tel"],
  "ઘી": ["ghee"],
  // Extended common grocery Gujarati tokens
  "ખાંડ": ["khand", "sugar", "sakkar"],
  "ગોળ": ["gol", "gud", "jaggery"],
  "મીઠું": ["mithu", "salt", "namak"],
  "ચા": ["cha", "chai", "tea"],
  "ચોખા": ["chokha", "rice", "chawal"],
  "પૌંઆ": ["poha", "pauva", "pova", "powa"],
  "પોવા": ["poha", "pauva", "pova", "powa"],
  "રવો": ["ravo", "rava", "sooji", "suji"],
  "સોજી": ["sooji", "suji", "rava"],
  "મેંદો": ["maida", "maido"],
  "બેસન": ["besan", "gramflour", "chanaatta"],
  "સાબુદાણા": ["sabudana", "sago"],
  "મરચું": ["marchu", "chilli", "mirchi", "redchilli"],
  "ધાણા": ["dhana", "coriander"],
  "ધાણાજીરું": ["dhanajeera", "dhanajiru"],
  "હિંગ": ["hing", "asafoetida"],
  "લવિંગ": ["laving", "clove"],
  "તજ": ["taj", "cinnamon"],
  "કાજુ": ["kaju", "cashew"],
  "બદામ": ["badam", "almond"],
  "કિસમિસ": ["kismis", "raisins", "draksh"],
  "સાબુ": ["sabu", "soap"],
  "શેમ્પૂ": ["shampoo", "shampu"],
  "બિસ્કિટ": ["biscuit", "biscuits"],
  "દૂધ": ["doodh", "dudh", "milk"],
  "છાશ": ["chhas", "chhash", "buttermilk"],
  "દહીં": ["dahi", "curd"],
  "પાપડ": ["papad", "papadum"],
  "અનાજ": ["anaj", "grains", "grain"],
  "કઠોળ": ["kathol", "pulses", "pulse"],
  "મસાલા": ["masala", "spices", "spice"],
};

export function normalizeSearchToken(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\s\-_.,/()[\]{}"'`:]/g, "") // Strip spaces, hyphens, punctuation
    .trim();
}

export function matchesGroceryQuery(product: any, rawQuery: string, categoryName?: string): boolean {
  if (!product) return false;
  if (!rawQuery || !rawQuery.trim()) return true;

  const cleanQuery = rawQuery.trim().toLowerCase();
  const queryTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const compactQuery = normalizeSearchToken(rawQuery);

  const nameParts = [
    product.name,
    product.nameGu,
    product.name_gu,
    product.nameEn,
    product.name_en,
  ].filter(Boolean);
  const targetName = (nameParts.length > 0 ? nameParts.join(" ") : (product.name || product.nameGu || product.nameEn || "")).toLowerCase();

  const categoryParts = [product.category, categoryName].filter(Boolean);
  const targetCategory = (categoryParts.length > 0 ? categoryParts.join(" ") : (product.category || "")).toLowerCase();

  const targetBrand = (product.brand && product.brand !== "Other" ? String(product.brand) : "").toLowerCase();

  const compactTargetName = normalizeSearchToken(targetName);
  const compactCategory = normalizeSearchToken(targetCategory);
  const compactBrand = normalizeSearchToken(targetBrand);

  // 1. Direct or Compact Substring Match (e.g. "મસુર દાળ" matches "મસુરદાળ")
  if (
    compactTargetName &&
    compactQuery &&
    (compactTargetName.includes(compactQuery) ||
      (compactTargetName.length >= 2 && compactQuery.includes(compactTargetName)))
  ) {
    return true;
  }

  // 2. Token-by-token check
  const allTokensMatch = queryTokens.every((qToken) => {
    const compactQ = normalizeSearchToken(qToken);
    if (!compactQ) return true;

    if (
      targetName.includes(qToken) ||
      (compactTargetName && compactTargetName.includes(compactQ)) ||
      targetCategory.includes(qToken) ||
      (compactCategory && compactCategory.includes(compactQ)) ||
      targetBrand.includes(qToken) ||
      (compactBrand && compactBrand.includes(compactQ))
    ) {
      return true;
    }

    // 3. Dictionary & Phonetic cross-match
    for (const [guj, engList] of Object.entries(PHONETIC_DICTIONARY)) {
      const normGuj = normalizeSearchToken(guj);
      if (!normGuj) continue;

      const isMatchGuj = compactTargetName && (compactTargetName.includes(normGuj) || normGuj.includes(compactTargetName));

      const matchesEnglishQuery = engList.some((e) => {
        const normE = normalizeSearchToken(e);
        return normE && (compactQ.includes(normE) || normE.includes(compactQ));
      });

      const matchesGujaratiQuery = compactQ.includes(normGuj) || normGuj.includes(compactQ);

      const targetMatchesEnglish = engList.some((e) => {
        const normE = normalizeSearchToken(e);
        return normE && compactTargetName && (compactTargetName.includes(normE) || normE.includes(compactTargetName));
      });

      if (
        (isMatchGuj && matchesEnglishQuery) ||
        (matchesGujaratiQuery && targetMatchesEnglish) ||
        (matchesEnglishQuery && targetMatchesEnglish) ||
        (matchesGujaratiQuery && isMatchGuj)
      ) {
        return true;
      }
    }
    return false;
  });

  return allTokensMatch;
}
