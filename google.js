const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // твій JSON ключ від Google Service Account
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SPREADSHEET_ID = "1lbRiVazy7t--66xIp2G0o_mWj0OD0Bq3vQpH3wasMfA"; // твій ID таблиці
const SHEET_NAME = "Sheet1";

// 🔧 Перевірка чи існує аркуш, якщо ні — створюємо з заголовками
async function ensureSheetExists() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheetExists = spreadsheet.data.sheets.some(
    (s) => s.properties.title === SHEET_NAME,
  );

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: SHEET_NAME },
            },
          },
        ],
      },
    });

    // додаємо заголовки
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME + "!A1:F1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["ChatID", "Type", "Amount", "Currency", "Category", "Date"]],
      },
    });

    console.log(`✅ Створено аркуш "${SHEET_NAME}" з заголовками`);
  }
}

async function getRows() {
  await ensureSheetExists();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
  });

  return res.data.values || [];
}

async function addRow(data) {
  await ensureSheetExists();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [data],
    },
  });
}

module.exports = { addRow, getRows };
