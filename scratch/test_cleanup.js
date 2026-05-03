
const cleanupText = (text) => {
  let cleaned = text;

  // 1. Reconstruct letter-spaced titles
  cleaned = cleaned.replace(/\b([A-Za-z](?: [A-Za-z])+)\b/g, (match) => {
    return match.replace(/ /g, '');
  });

  // 2. Paragraph Reconstruction & Line Merging
  const rawLines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const reconstructed = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    let current = rawLines[i];
    
    while (i + 1 < rawLines.length) {
      const next = rawLines[i + 1];
      const lastChar = current[current.length - 1];
      const nextFirstChar = next[0];
      
      const isTerminal = /[.!?:"”)]/.test(lastChar);
      const isHyphen = lastChar === '-';
      const isNextLower = /[a-z]/.test(nextFirstChar);
      const isNextUpper = /[A-Z]/.test(nextFirstChar);
      
      // Heuristic: Is the current line likely a header? (Short and no terminal punctuation)
      const isShort = current.length < 40;
      const looksLikeHeader = isShort && !/[a-z]/.test(current); // All caps or short title

      if (isHyphen) {
        current = current.slice(0, -1) + next;
        i++;
      } else if (!isTerminal && !looksLikeHeader) {
        // Aggressively merge lines that don't end in punctuation,
        // but avoid merging if the next line looks like a new header or list.
        const nextIsList = /^(\d+\.|[•\-\*])/.test(next);
        const nextIsHeader = next.length < 40 && !/[a-z]/.test(next);
        
        if (!nextIsList && !nextIsHeader) {
          current += ' ' + next;
          i++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    reconstructed.push(current);
  }
  
  cleaned = reconstructed.join('\n\n');

  return cleaned
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const sampleText = `
LETTER FROM THE EDITORS

With this issue, scholars at the Hoover
Institution are launching a

program designed to evaluate free-
market capitalism, socialism, and

hybrid systems to determine how well the
various governmental and

economic forms promote general well-
being and prosperity.

The
project is particularly important and
`;

console.log("--- ORIGINAL ---");
console.log(sampleText);
console.log("\n--- CLEANED ---");
console.log(cleanupText(sampleText));
