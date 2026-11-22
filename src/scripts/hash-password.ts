import { hashPassword } from "@/lib/crypto";

const password = process.argv[2];

if (!password) {
  console.error("Uso: npm run password:hash -- 'sua-senha'");
  process.exit(1);
}

console.log(hashPassword(password));
