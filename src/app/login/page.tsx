import type { Metadata } from "next";
import { BrandMark } from "@/components/common/brand";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background-gray-secondary_alt_2 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark className="mb-4 size-12 rounded-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">ficonpa</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Boletos do e-mail direto para o Conta Azul.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
