"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AuthShell, EyeButton, Field } from "./auth-shared";
import type { AuthErrors, AuthFormProps, User } from "./auth-shared";

// หน้าเข้าสู่ระบบ (เชื่อมต่อ MongoDB ผ่าน /api/auth/login)
// ใช้เป็นคอมโพเนนต์ใน app/page.tsx: <LoginForm onAuthed={...} onSwitch={...} />
export default function LoginForm({ onAuthed, onSwitch }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const uname = username.trim();
    const err: AuthErrors = {};
    if (!uname) err.username = "กรอก username";
    if (!password) err.password = "กรอกรหัสผ่าน";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password }),
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
    <AuthShell isReg={false}>
      <form
        onSubmit={submit}
        noValidate
        className="mx-auto mt-auto w-full max-w-sm pb-[clamp(4px,1.5dvh,12px)] pt-[clamp(8px,3dvh,32px)] lg:my-auto lg:py-6"
      >
        <h1 className="text-[clamp(24px,4dvh,30px)] font-bold leading-tight tracking-tight">
          ยินดีต้อนรับกลับมา
        </h1>
        <p className="mt-1 text-[clamp(13px,1.8dvh,14px)] text-white/80 lg:text-[#6B7A6E]">
          เข้าสู่ระบบเพื่อไปต่อจากรอบล่าสุด
        </p>

        {/* ช่องกรอกปรับขนาดตามความสูงหน้าจอ (dvh) ให้พอดีจอ ไม่ต้องเลื่อน + ขอบมนสุด */}
        <div className="mt-[clamp(12px,3dvh,24px)] space-y-[clamp(10px,2.2dvh,20px)] [&_input]:h-[clamp(48px,7.5dvh,64px)] [&_input]:rounded-full [&_input]:text-[clamp(16px,2.3dvh,18px)] [&_div:has(>input)]:h-[clamp(48px,7.5dvh,64px)] [&_div:has(>input)]:rounded-full">
          <Field
            label="Username"
            value={username}
            onChange={edit("username", setUsername)}
            maxLength={20}
            autoComplete="username"
            placeholder="เช่น manao_99"
            error={errors.username}
            autoFocus
          />
          <Field
            label="รหัสผ่าน"
            value={password}
            onChange={edit("password", setPassword)}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="รหัสผ่านของคุณ"
            error={errors.password}
            trailing={<EyeButton show={show} onToggle={() => setShow((v) => !v)} />}
          />
        </div>

        {/* ลืมรหัสผ่าน */}
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={() => onSwitch("forgot")}
            disabled={busy}
            className="px-2 py-1 text-[14px] font-semibold text-[#C9F25B] underline-offset-2 hover:underline disabled:opacity-60 lg:text-[#3F5E1F]"
          >
            ลืมรหัสผ่าน?
          </button>
        </div>

        {errors.form && (
          <p
            role="alert"
            className="pj-in mt-2 rounded-2xl bg-[#FDE8E6] px-4 py-3 text-[14px] text-[#D92D20]"
          >
            {errors.form}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-[clamp(10px,2dvh,16px)] flex h-[clamp(48px,7dvh,56px)] w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60"
        >
          {busy ? "กำลังดำเนินการ" : "เข้าสู่ระบบ"}
        </button>

        <p className="mt-[clamp(10px,2.2dvh,20px)] text-center text-[14px] text-white/80 lg:text-[#6B7A6E]">
          ยังไม่มีบัญชี?{" "}
          <button
            type="button"
            onClick={() => onSwitch("register")}
            className="font-semibold text-[#C9F25B] underline-offset-2 hover:underline lg:text-[#3F5E1F]"
          >
            สมัครสมาชิก
          </button>
        </p>
        <p className="mt-[clamp(6px,1.5dvh,12px)] text-center text-[12px] text-white/60 max-[700px]:hidden lg:hidden">
          สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
        </p>
      </form>
    </AuthShell>
  );
}