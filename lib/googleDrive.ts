import { google } from "googleapis";
import { Readable } from "stream";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

export async function uploadProfileImage(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
) {
  try {
    const folderId = "1s7wBg26QrXYsWIqwLf08ZtaZmd1nWOBJ";

    const fileStream = new Readable();
    fileStream.push(fileBuffer);
    fileStream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType,
        body: fileStream,
      },
      fields: "id, webViewLink, webContentLink",
      supportsAllDrives: true, // เพิ่มบรรทัดนี้ เพื่อให้ใช้โควตาพื้นที่ของบัญชีหลักที่แชร์โฟลเดอร์มา
    });

    return {
      success: true,
      fileId: response.data.id,
      avatarUrl: `https://lh3.googleusercontent.com/d/${response.data.id}`,
    };
  } catch (error) {
    console.error("Upload to Google Drive failed:", error);
    return { success: false, error };
  }
}