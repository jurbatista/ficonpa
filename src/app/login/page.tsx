import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Entrar | ficonpa",
};

export default function LoginPage() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background-gray-secondary_alt_2 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-500 text-white shadow-lg">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 3.5h9.5a2.5 2.5 0 0 1 0 5H4v-5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M4 11h6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M4 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">ficonpa</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Boletos por e-mail, direto para o Conta Azul.
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs leading-5 text-text-tertiary">
          Acesso restrito. Os anexos são processados apenas para identificar e lançar contas a
          pagar, com retenção máxima de 90 dias.
        </p>
      </div>
    </div>
  );
}
