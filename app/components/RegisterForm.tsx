"use client";

import { useState, useRef } from "react";
import type { FormEvent, ChangeEvent } from "react";
import {
  AuthShell,
  EyeButton,
  Field,
  Segmented,
  SelectField,
} from "./auth-shared";
import type {
  AuthErrors,
  AuthFormProps,
  AuthMode,
  User,
} from "./auth-shared";
import { DEPARTMENTS } from "./departments";

const DEPT_OPTIONS = DEPARTMENTS.map((d) => ({
  value: String(d.id),
  label: d.th === d.en ? d.en : `${d.th} (${d.en})`,
}));

export default function RegisterForm({ onAuthed, onSwitch }: AuthFormProps) {
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);

  // สถานะสำหรับไฟล์รูปภาพและรูปพรีวิว
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  // จัดการเมื่อผู้ใช้เลือกไฟล์รูปภาพ
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors((p) => ({ ...p, form: "ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB" }));
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setErrors((p) => ({ ...p, form: undefined }));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const nick = nickname.trim();
    const uname = username.trim();
    const err: AuthErrors = {};
    if (!nick) err.nickname = "กรอกชื่อเล่น";
    if (!departmentId) err.departmentId = "เลือกแผนก";
    if (!uname) err.username = "กรอก username";
    else if (!/^[A-Za-z0-9_]{3,20}$/.test(uname))
      err.username = "3-20 ตัว ใช้ a-z 0-9 และ _ เท่านั้น";
    if (!password) err.password = "กรอกรหัสผ่าน";
    else if (password.length < 6)
      err.password = "รหัสผ่านอย่างน้อย 6 ตัวอักษร";
    if (!err.password && confirm !== password)
      err.confirm = "รหัสผ่านไม่ตรงกัน";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setBusy(true);
    try {
      // ใช้ FormData ในการส่งข้อมูลตัวอักษรพร้อมกับไฟล์รูปภาพ
      const formData = new FormData();
      formData.append("nickname", nick);
      formData.append("username", uname);
      formData.append("departmentId", departmentId);
      formData.append("password", password);
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json().catch(() => ({}))) as {
        user?: User;
        errors?: AuthErrors;
        error?: string;
      };
      if (!res.ok || !data.user) {
        if (data.errors) setErrors(data.errors);
        else
          setErrors({
            form: data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง",
          });
        return;
      }
      onAuthed(data.user);
    } catch {
      setErrors({ form: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell isReg>
      <form
        onSubmit={submit}
        noValidate
        className="mx-auto mt-auto w-full max-w-sm pb-2 pt-8 lg:my-auto lg:py-6"
      >
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">
          สร้างบัญชีใหม่
        </h1>
        <p className="mt-1 text-[14px] text-white/80 lg:text-[#6B7A6E]">
          สมัครสมาชิกเพื่อเริ่มเก็บสถิติการกระโดดของคุณ
        </p>

        <div className="mt-6">
          <Segmented<AuthMode>
            value="register"
            onChange={(m) => {
              if (m === "login") onSwitch("login");
            }}
            options={
              [
                ["login", "เข้าสู่ระบบ"],
                ["register", "สมัครสมาชิก"],
              ] as const
            }
          />
        </div>

        {/* ส่วนเลือกและพรีวิวรูปโปรไฟล์ */}
        <div className="mt-5 flex flex-col items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/40 bg-white/10 transition-all hover:border-[#C9F25B] lg:border-[#6B7A6E]"
          >
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Profile Preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center text-xs text-white/70 group-hover:text-[#C9F25B] lg:text-[#6B7A6E]">
                <svg
                  className="mb-1 h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                <span>รูปโปรไฟล์</span>
              </div>
            )}
          </button>
          <span className="mt-1 text-[12px] text-white/60 lg:text-[#6B7A6E]">
            คลิกเพื่อเลือกรูปโปรไฟล์ (ไม่จำเป็น)
          </span>
        </div>

        <div className="mt-4 space-y-4">
          <Field
            label="ชื่อเล่น"
            value={nickname}
            onChange={edit("nickname", setNickname)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="เช่น มะนาว"
            error={errors.nickname}
            autoFocus
          />
          <SelectField
            label="แผนก"
            value={departmentId}
            onChange={edit("departmentId", setDepartmentId)}
            placeholder="-- เลือกแผนก --"
            options={DEPT_OPTIONS}
            error={errors.departmentId}
          />
          <Field
            label="Username"
            value={username}
            onChange={edit("username", setUsername)}
            maxLength={20}
            autoComplete="username"
            placeholder="เช่น manao_99"
            error={errors.username}
            hint="3-20 ตัว ใช้ a-z 0-9 และ _"
          />
          <Field
            label="รหัสผ่าน"
            value={password}
            onChange={edit("password", setPassword)}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="อย่างน้อย 6 ตัวอักษร"
            error={errors.password}
            trailing={
              <EyeButton show={show} onToggle={() => setShow((v) => !v)} />
            }
          />
          <Field
            label="ยืนยันรหัสผ่าน"
            value={confirm}
            onChange={edit("confirm", setConfirm)}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="พิมพ์รหัสผ่านอีกครั้ง"
            error={errors.confirm}
          />
        </div>

        {errors.form && (
          <p
            role="alert"
            className="pj-in mt-4 rounded-2xl bg-[#FDE8E6] px-4 py-3 text-[14px] text-[#D92D20]"
          >
            {errors.form}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60"
        >
          {busy ? "กำลังดำเนินการ" : "สมัครสมาชิก"}
        </button>

        <p className="mt-5 text-center text-[14px] text-white/80 lg:text-[#6B7A6E]">
          มีบัญชีอยู่แล้ว?{" "}
          <button
            type="button"
            onClick={() => onSwitch("login")}
            className="font-semibold text-[#C9F25B] underline-offset-2 hover:underline lg:text-[#3F5E1F]"
          >
            เข้าสู่ระบบ
          </button>
        </p>
        <p className="mt-3 text-center text-[12px] text-white/60 lg:hidden">
          สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
        </p>
      </form>
    </AuthShell>
  );
}