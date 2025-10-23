import XLSX from "xlsx";
import fs from "fs";

const rawData = fs.readFileSync("progress_profiles.json", "utf-8");
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const { profiles } = JSON.parse(rawData);

// Define custom headers
const headers = config.profile.headers;

// Map profiles to Excel rows with headers
const rows = profiles.map(profile => ({
  [headers.name]: profile.name,
  [headers.position1]: profile.position1,
  [headers.position2]: profile.position2,
  [headers.age]: profile.age,
  [headers.education]: profile.education,
  [headers.experience]: profile.experience
}));

// Convert JSON to worksheet
const worksheet = XLSX.utils.json_to_sheet(rows);

// Create workbook and append worksheet
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Profiles");

// Write Excel file
XLSX.writeFile(workbook, "profiles.xlsx");

console.log("Excel file created successfully!");
