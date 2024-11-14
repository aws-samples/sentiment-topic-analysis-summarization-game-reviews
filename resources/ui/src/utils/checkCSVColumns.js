export default function checkCSVColumns(file, requiredColumns) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const headers = reader.result
        .split('\n')[0]
        .split(',')
        .map(header => header.trim());

      const missingColumns = requiredColumns.filter(
        column => !headers.includes(column)
      );

      if (missingColumns.length === 0) {
        resolve(true);
      } else {
        reject(
          new Error(
            `CSV file does not have required columns: ${missingColumns.join(', ')}`
          )
        );
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the CSV file'));
    };

    reader.readAsText(file);
  });
}
