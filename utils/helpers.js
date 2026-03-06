// Conversion points vers euros
const pointsToEuros = (points) => {
  return points * 0.01;
};

// Conversion euros vers points
const eurosToPoints = (euros) => {
  return Math.round(euros * 100);
};

// Calculer la répartition d'une vente
const calculateSplit = (totalAmount, teacherPercentage = 70) => {
  const teacherCut = Math.round(totalAmount * (teacherPercentage / 100));
  const companyCut = totalAmount - teacherCut;
  
  return {
    teacherCut,
    companyCut,
    total: totalAmount
  };
};

// Simple recherche dans texte PDF pour IA
const searchInPDFText = (pdfText, query) => {
  if (!pdfText || !query) return null;
  
  const lowerText = pdfText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return null;
  
  // Extraire contexte (200 caractères avant et après)
  const start = Math.max(0, index - 200);
  const end = Math.min(pdfText.length, index + query.length + 200);
  const context = pdfText.substring(start, end);
  
  return {
    found: true,
    context: context.trim(),
    position: index
  };
};

// Simple IA réponse basée sur texte
const generateAIResponse = (pdfText, question) => {
  if (!pdfText) {
    return "Je n'ai pas de contenu PDF à analyser.";
  }
  
  // Recherche de mots-clés dans la question
  const keywords = question.toLowerCase()
    .split(' ')
    .filter(word => word.length > 3);
  
  let bestMatch = null;
  let bestScore = 0;
  
  // Diviser le PDF en paragraphes
  const paragraphs = pdfText.split('\n\n').filter(p => p.trim().length > 50);
  
  for (const paragraph of paragraphs) {
    const lowerPara = paragraph.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      if (lowerPara.includes(keyword)) {
        score += 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = paragraph;
    }
  }
  
  if (bestMatch && bestScore > 0) {
    return `D'après le document : ${bestMatch.substring(0, 300)}...`;
  }
  
  return "Je n'ai pas trouvé d'information pertinente dans le document pour cette question.";
};

// Formater date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Générer code unique
const generateUniqueCode = (prefix = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}${timestamp}${random}`.toUpperCase();
};

module.exports = {
  pointsToEuros,
  eurosToPoints,
  calculateSplit,
  searchInPDFText,
  generateAIResponse,
  formatDate,
  generateUniqueCode
};