"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AuthShell, EyeButton, Field, SelectField } from "./auth-shared";
import type { AuthErrors, AuthFormProps } from "./auth-shared";
import { COMPANIES } from "./departments";

const COMPANY_OPTIONS = COMPANIES.map((c) => ({
  value: String(c.id),
  label: c.name,
}));

export default function ForgotForm({ onSwitch }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const err: AuthErrors = {};
    if (!username.trim()) err.username = "กรอก username";
    if (!companyId) err.companyId = "เลือกบริษัท";
    if (!employeeId.trim()) err.employeeId = "กรอกรหัสพนักงาน";
    if (password.length < 6) err.password = "รหัสผ่านอย่างน้อย 6 ตัวอักษร";
    else if (confirm !== password) err.confirm = "รหัสผ่านไม่ตรงกัน";
    if (Object.keys(err).length) {
      setErrors(err);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          companyId: Number(companyId),
          employeeId: employeeId.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: AuthErrors;
      };
      if (!res.ok || !data.ok) {
        setErrors(
          data.errors ?? {
            form:
              res.status === 401
                ? "ข้อมูลไม่ถูกต้อง"
                : data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง",
          }
        );
        return;
      }
      setDone(true);
    } catch {
      setErrors({ form: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "flex h-14 w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60";
  const pill =
    "[&_input]:h-14 [&_input]:rounded-full [&_div:has(>input)]:rounded-full [&_select]:h-14 [&_select]:rounded-full [&_select]:px-6";

  if (done) {
    return (
      <AuthShell isReg={false} title="ตั้งรหัสผ่านใหม่สำเร็จ">
        <div className="mx-auto mt-auto w-full max-w-sm pb-3 pt-6 text-center lg:my-auto">
          <h1 className="text-[28px] font-bold leading-tight">
            ตั้งรหัสผ่านใหม่แล้ว
          </h1>
          <p className="mt-2 text-[14px] text-white/80 lg:text-[#6B7A6E]">
            เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย
          </p>
          <button
            type="button"
            onClick={() => onSwitch("login")}
            className={`${btn} mt-6`}
          >
            ไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell isReg={false} title="ลืมรหัสผ่าน">
      <form
        onSubmit={submit}
        noValidate
        className="mx-auto mt-auto w-full max-w-sm pb-3 pt-6 lg:my-auto"
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">
          ลืมรหัสผ่าน
        </h1>
        <p className="mt-1 text-[14px] text-white/80 lg:text-[#6B7A6E]">
          กรอก username บริษัท และรหัสพนักงาน แล้วตั้งรหัสผ่านใหม่
        </p>

        <div className={`mt-5 space-y-4 ${pill}`}>
          <Field
            label="Username"
            value={username}
            onChange={edit("username", setUsername)}
            maxLength={20}
            autoComplete="username"
            error={errors.username}
            autoFocus
          />
          <SelectField
            label="บริษัท"
            value={companyId}
            onChange={edit("companyId", setCompanyId)}
            options={COMPANY_OPTIONS}
            placeholder="เลือกบริษัทของคุณ"
            error={errors.companyId}
          />
          <Field
            label="รหัสพนักงาน"
            value={employeeId}
            onChange={edit("employeeId", setEmployeeId)}
            maxLength={20}
            autoComplete="off"
            error={errors.employeeId}
          />
          <Field
            label="รหัสผ่านใหม่"
            value={password}
            onChange={edit("password", setPassword)}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="อย่างน้อย 6 ตัวอักษร"
            error={errors.password}
            trailing={<EyeButton show={show} onToggle={() => setShow((v) => !v)} />}
          />
          <Field
            label="ยืนยันรหัสผ่านใหม่"
            value={confirm}
            onChange={edit("confirm", setConfirm)}
            type={show ? "text" : "password"}
            autoComplete="new-password"
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

        <button type="submit" disabled={busy} className={`${btn} mt-5`}>
          {busy ? "กำลังบันทึก" : "ตั้งรหัสผ่านใหม่"}
        </button>
        <button
          type="button"
          onClick={() => onSwitch("login")}
          disabled={busy}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white/80 transition-colors hover:text-white disabled:opacity-60 lg:text-[#3F5E1F] lg:hover:text-[#1B2A21]"
        >
          กลับไปเข้าสู่ระบบ
        </button>
      </form>
    </AuthShell>
  );
}