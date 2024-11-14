// create a function that checks the number of rows in a CSV
export default function countCSVRows(csvString) {
  // Split the CSV string into rows
  const rows = csvString.split('\n');
  
  // Return the length of the rows array
  return rows.length;
}