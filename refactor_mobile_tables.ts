import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.tsx')) {
      callback(fullPath);
    }
  }
}

function processFiles() {
  const dirs = ['src/pages', 'src/components'];
  dirs.forEach(dir => {
    walk(dir, (filePath) => {
      let content = fs.readFileSync(filePath, 'utf-8');
      
      let newContent = content;

      // Ensure table itself has min-w
      newContent = newContent.replace(/<table className="([^"]*)"/g, (match, classes) => {
          let updated = classes;
          if (!updated.includes('min-w-')) {
             updated += ' min-w-[700px] md:min-w-full';
          }
          return `<table className="${updated}"`;
      });
      
      // Standardize th and td
      // For th: we want px-4 py-3 md:px-6 md:py-4 instead of px-6 py-4, and add whitespace-nowrap
      newContent = newContent.replace(/<th([^>]*)className="([^"]*)"/g, (match, p1, classes) => {
          let updated = classes.replace('px-6 py-4', 'px-4 py-3 md:px-6 md:py-4');
          if (!updated.includes('whitespace-nowrap')) updated += ' whitespace-nowrap';
          return `<th${p1}className="${updated}"`;
      });

      // For td
      newContent = newContent.replace(/<td([^>]*)className="([^"]*)"/g, (match, p1, classes) => {
          let updated = classes.replace('px-6 py-4', 'px-4 py-3 md:px-6 md:py-4');
          // Add whitespace-nowrap if not present
          if (!updated.includes('whitespace-nowrap') && !updated.includes('whitespace-normal') && !updated.includes('text-wrap') && !updated.includes('max-w-')) {
              updated += ' whitespace-nowrap';
          }
          return `<td${p1}className="${updated}"`;
      });

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Mobile tables refactored");
