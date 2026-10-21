import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "../../../../lib/mongodb";
import { createSession } from "../../../../lib/auth";
import { validateOrg } from "../../../components/branches";

export async function POST(req: Request) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const nicknameRaw = formData.get("nickname");
    const usernameRaw = formData.get("username");
    const passwordRaw = formData.get("password");
    const companyRaw = formData.get("companyId");
    const departmentRaw = formData.get("departmentId");
    const branchRaw = formData.get("branchId");
    const avatarFile = formData.get("avatar") as File | null;

    const nickname =
      typeof nicknameRaw === "string" ? nicknameRaw.trim().slice(0, 20) : "";
    const display =
      typeof usernameRaw === "string" ? usernameRaw.trim() : "";
    const password = typeof passwordRaw === "string" ? passwordRaw : "";
    const companyId =
      typeof companyRaw === "string" && /^\d{1,3}$/.test(companyRaw)
        ? Number(companyRaw)
        : null;
    // แผนก/สาขาไม่บังคับที่ระดับ parse (validateOrg ตรวจกติกาตามบริษัทให้)
    const departmentId =
      typeof departmentRaw === "string" && /^\d{1,4}$/.test(departmentRaw)
        ? Number(departmentRaw)
        : null;
    const branchId =
      typeof branchRaw === "string" && /^\d{1,5}$/.test(branchRaw)
        ? Number(branchRaw)
        : null;

    const errors: Record<string, string> = {};
    if (!nickname) errors.nickname = "กรอกชื่อเล่น";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(display))
      errors.username = "3-20 ตัว ใช้ a-z 0-9 และ _ เท่านั้น";
    if (password.length < 6 || password.length > 72)
      errors.password = "รหัสผ่านต้องยาว 6-72 ตัวอักษร";
    if (!companyId) errors.companyId = "เลือกบริษัท";
    else Object.assign(errors, validateOrg(companyId, departmentId, branchId));
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    let avatarUrl = "";
    let driveFileId = "";

    // หากมีรูปโปรไฟล์ ให้ส่งแปลงเป็น Base64 แล้วส่งให้ Google Apps Script บันทึก
    if (avatarFile && avatarFile.size > 0) {
      try {
        const arrayBuffer = await avatarFile.arrayBuffer();
        const fileBase64 = Buffer.from(arrayBuffer).toString("base64");
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const fileName = `avatar_${display}_${Date.now()}.${ext}`;

        const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

        if (GAS_URL) {
          const gasResponse = await fetch(GAS_URL, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            redirect: "follow",
            body: JSON.stringify({
              fileBase64,
              fileName,
              fileType: avatarFile.type,
            }),
          });

          const gasResult = await gasResponse.json();

          if (gasResult.success) {
            avatarUrl = gasResult.imageUrl;
            driveFileId = gasResult.fileId;
          }
        }
      } catch (uploadError) {
        console.error("Failed to upload via Apps Script:", uploadError);
      }
    }

    const db = await getDb();
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const r = await db.collection("users").insertOne({
        username: display.toLowerCase(),
        display,
        nickname,
        passwordHash,
        avatarUrl,
        driveFileId,
        companyId,
        departmentId,
        branchId,
        points: 0,
        createdAt: new Date(),
      });

      await createSession(r.insertedId);

      return NextResponse.json(
        {
          user: {
            name: nickname,
            username: display,
            avatarUrl,
            points: 0,
            companyId,
            departmentId,
            branchId,
          },
        },
        { status: 201 }
      );
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        return NextResponse.json(
          { errors: { username: "username นี้ถูกใช้แล้ว" } },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("register failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}